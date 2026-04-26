import logging

from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Channel, ChannelSyncLog, MarketplaceOrder
from .serializers import ChannelSerializer, ChannelSyncLogSerializer, MarketplaceOrderSerializer

logger = logging.getLogger(__name__)


def _make_log(channel, sync_type) -> ChannelSyncLog:
    return ChannelSyncLog.objects.create(
        channel=channel,
        sync_type=sync_type,
        status='running',
        started_at=timezone.now(),
    )


def _fail_log(log, message):
    log.status = 'failed'
    log.message = str(message)[:1000]
    log.completed_at = timezone.now()
    log.save()


def _complete_log(log, **kwargs):
    log.status = 'completed'
    log.completed_at = timezone.now()
    for k, v in kwargs.items():
        setattr(log, k, v)
    log.save()


class ChannelViewSet(viewsets.ModelViewSet):
    queryset = Channel.objects.prefetch_related('sync_logs').all()
    serializer_class = ChannelSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['channel_type', 'status']
    search_fields = ['name']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    # ── Credentials ───────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='set-credentials')
    def set_credentials(self, request, pk=None):
        """
        Merge provided credential fields into the channel's api_credentials.
        Omit a field (or send empty string) to keep the existing value.
        """
        channel = self.get_object()
        current = dict(channel.api_credentials or {})
        for key, value in (request.data or {}).items():
            if value not in (None, ''):
                current[key] = value
        channel.api_credentials = current
        channel.save(update_fields=['api_credentials'])
        summary = ChannelSerializer(channel).get_credentials_summary(channel)
        return Response({'ok': True, 'credentials_summary': summary})

    # ── Connection test ───────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        channel = self.get_object()
        creds = channel.api_credentials or {}

        if channel.channel_type == Channel.TYPE_WOOCOMMERCE:
            missing = [
                k for k in ('store_url', 'consumer_key', 'consumer_secret')
                if not creds.get(k)
            ]
            if missing:
                return Response(
                    {'ok': False, 'message': f'Missing credentials: {", ".join(missing)}. Save credentials first.'},
                    status=400,
                )
            from .integrations.woocommerce import WooCommerceClient, WooCommerceError
            try:
                client = WooCommerceClient(
                    store_url=creds['store_url'],
                    consumer_key=creds['consumer_key'],
                    consumer_secret=creds['consumer_secret'],
                    timeout=15,
                )
                data = client.test_connection()
                env = data.get('environment', {})
                store_settings = data.get('settings', {})
                msg = (
                    f"Connected to \"{store_settings.get('title', creds['store_url'])}\". "
                    f"WooCommerce {env.get('version', '?')}, "
                    f"WordPress {env.get('wp_version', '?')}."
                )
                channel.status = Channel.STATUS_ACTIVE
                channel.save(update_fields=['status'])
                return Response({'ok': True, 'message': msg})
            except WooCommerceError as exc:
                channel.status = Channel.STATUS_ERROR
                channel.save(update_fields=['status'])
                return Response({'ok': False, 'message': str(exc)}, status=400)

        return Response(
            {'ok': False, 'message': f'Test connection not yet supported for "{channel.channel_type}".'},
            status=400,
        )

    # ── Full sync ─────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='sync')
    def sync(self, request, pk=None):
        """Full sync: import orders then push stock."""
        channel = self.get_object()
        log = _make_log(channel, 'full')
        try:
            from .sync import import_woocommerce_orders, push_stock_to_woocommerce
            order_stats = import_woocommerce_orders(channel, user=request.user)
            stock_stats = push_stock_to_woocommerce(channel)
            msg = (
                f"Orders: {order_stats['created']} imported, "
                f"{order_stats.get('duplicate', 0)} duplicate, "
                f"{order_stats['failed']} failed. "
                f"Stock: {stock_stats['success']} updated, "
                f"{stock_stats['failed']} failed."
            )
            _complete_log(
                log,
                records_created=order_stats['created'],
                records_processed=order_stats['processed'],
                records_updated=stock_stats['success'],
                records_failed=order_stats['failed'] + stock_stats['failed'],
                message=msg,
            )
            channel.last_synced = timezone.now()
            channel.last_sync_status = 'completed'
            channel.last_sync_message = msg
            channel.save(update_fields=['last_synced', 'last_sync_status', 'last_sync_message'])
            return Response(ChannelSyncLogSerializer(log).data)
        except Exception as exc:
            _fail_log(log, exc)
            channel.last_sync_status = 'failed'
            channel.last_sync_message = str(exc)[:500]
            channel.save(update_fields=['last_sync_status', 'last_sync_message'])
            logger.error("Full sync failed for channel %s: %s", channel.name, exc, exc_info=True)
            return Response({'error': str(exc)}, status=500)

    # ── Import orders ─────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='sync-orders')
    def sync_orders(self, request, pk=None):
        """Import new orders from the channel."""
        channel = self.get_object()
        log = _make_log(channel, 'import_orders')
        try:
            from .sync import import_woocommerce_orders
            stats = import_woocommerce_orders(channel, user=request.user)
            msg = (
                f"Imported {stats['created']} new orders, "
                f"{stats.get('duplicate', 0)} duplicates skipped, "
                f"{stats['failed']} failed "
                f"({stats['processed']} processed total)."
            )
            _complete_log(
                log,
                records_processed=stats['processed'],
                records_created=stats['created'],
                records_failed=stats['failed'],
                message=msg,
            )
            channel.last_synced = timezone.now()
            channel.last_sync_status = 'completed'
            channel.last_sync_message = msg
            channel.save(update_fields=['last_synced', 'last_sync_status', 'last_sync_message'])
            return Response(ChannelSyncLogSerializer(log).data)
        except Exception as exc:
            _fail_log(log, exc)
            logger.error("Order import failed for %s: %s", channel.name, exc, exc_info=True)
            return Response({'error': str(exc)}, status=500)

    # ── Push stock ────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='push-stock')
    def push_stock(self, request, pk=None):
        """Push current stock levels to the channel."""
        channel = self.get_object()
        log = _make_log(channel, 'push_stock')
        try:
            from .sync import push_stock_to_woocommerce
            stats = push_stock_to_woocommerce(channel)
            msg = (
                f"Stock: {stats['success']} updated, "
                f"{stats['failed']} failed, "
                f"{stats['skipped']} skipped (no WC product ID)."
            )
            _complete_log(
                log,
                records_processed=stats['success'] + stats['failed'] + stats['skipped'],
                records_updated=stats['success'],
                records_failed=stats['failed'],
                message=msg,
            )
            return Response(ChannelSyncLogSerializer(log).data)
        except Exception as exc:
            _fail_log(log, exc)
            logger.error("Stock push failed for %s: %s", channel.name, exc, exc_info=True)
            return Response({'error': str(exc)}, status=500)

    # ── Push tracking ─────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='push-tracking')
    def push_tracking(self, request, pk=None):
        """Push a dispatched order's tracking number back to the channel."""
        channel = self.get_object()
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=400)

        from sales.models import SalesOrder
        from .sync import push_tracking_to_woocommerce

        try:
            so = SalesOrder.objects.get(pk=order_id)
        except SalesOrder.DoesNotExist:
            return Response({'error': 'Order not found'}, status=404)

        log = _make_log(channel, 'push_tracking')
        result = push_tracking_to_woocommerce(channel, so)

        if result['success']:
            _complete_log(
                log,
                records_updated=1,
                message=(
                    f"Tracking {result['tracking']} pushed to WC order "
                    f"#{result.get('wc_order_id')} for {so.order_number}."
                ),
            )
            return Response({'ok': True, 'message': log.message})

        _fail_log(log, result['error'])
        return Response({'ok': False, 'error': result['error']}, status=400)

    # ── Logs & orders ─────────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='sync-logs')
    def sync_logs_list(self, request, pk=None):
        channel = self.get_object()
        logs = channel.sync_logs.all()[:50]
        return Response(ChannelSyncLogSerializer(logs, many=True).data)

    @action(detail=True, methods=['get'], url_path='marketplace-orders')
    def marketplace_orders_list(self, request, pk=None):
        channel = self.get_object()
        orders = (
            channel.marketplace_orders
            .select_related('sales_order')
            .order_by('-fetched_at')[:100]
        )
        return Response(MarketplaceOrderSerializer(orders, many=True).data)
