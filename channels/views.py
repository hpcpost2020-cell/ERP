import logging

from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Channel, ChannelSyncLog, MarketplaceOrder
from .serializers import (
    ChannelSerializer,
    ChannelSyncLogSerializer,
    MarketplaceOrderSerializer,
    ChannelListingDetailSerializer,
)

logger = logging.getLogger(__name__)


# ── Log helpers ───────────────────────────────────────────────────────────────

def _make_log(channel, sync_type) -> ChannelSyncLog:
    return ChannelSyncLog.objects.create(
        channel=channel, sync_type=sync_type, status='running', started_at=timezone.now()
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


# ── ViewSet ───────────────────────────────────────────────────────────────────

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
        """Merge-update api_credentials. Blank / missing fields keep their existing values."""
        channel = self.get_object()
        current = dict(channel.api_credentials or {})
        for key, value in (request.data or {}).items():
            if value not in (None, ''):
                current[key] = value
        channel.api_credentials = current
        channel.save(update_fields=['api_credentials'])
        return Response({
            'ok': True,
            'credentials_summary': ChannelSerializer(channel).get_credentials_summary(channel),
        })

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
                    {'ok': False, 'message': f'Missing: {", ".join(missing)}. Save credentials first.'},
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
                wc_ver = env.get('version', '?')
                wp_ver = env.get('wp_version', '?')
                store_title = store_settings.get('title', creds['store_url'])
                msg = f'Connected to "{store_title}". WooCommerce {wc_ver}, WordPress {wp_ver}.'
                channel.status = Channel.STATUS_ACTIVE
                channel.save(update_fields=['status'])
                return Response({'ok': True, 'message': msg})
            except WooCommerceError as exc:
                channel.status = Channel.STATUS_ERROR
                channel.save(update_fields=['status'])
                return Response({'ok': False, 'message': str(exc)}, status=400)

        if channel.channel_type == Channel.TYPE_EBAY:
            from .integrations.ebay import EbayClient, EbayError
            try:
                client = EbayClient.from_channel(channel)
                result = client.test_connection()
                channel.status = Channel.STATUS_ACTIVE
                channel.save(update_fields=['status'])
                return Response(result)
            except EbayError as exc:
                channel.status = Channel.STATUS_ERROR
                channel.save(update_fields=['status'])
                return Response({'ok': False, 'message': str(exc)}, status=400)
            except ValueError as exc:
                return Response({'ok': False, 'message': str(exc)}, status=400)

        if channel.channel_type == Channel.TYPE_AMAZON:
            from .integrations.amazon import AmazonClient, AmazonError
            try:
                client = AmazonClient.from_channel(channel)
                result = client.test_connection()
                channel.status = Channel.STATUS_ACTIVE
                channel.save(update_fields=['status'])
                return Response(result)
            except AmazonError as exc:
                channel.status = Channel.STATUS_ERROR
                channel.save(update_fields=['status'])
                return Response({'ok': False, 'message': str(exc)}, status=400)
            except ValueError as exc:
                return Response({'ok': False, 'message': str(exc)}, status=400)

        return Response(
            {'ok': False, 'message': f'Test not yet supported for "{channel.channel_type}".'},
            status=400,
        )

    # ── eBay OAuth ────────────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='ebay-auth-url')
    def ebay_auth_url(self, request, pk=None):
        """
        Generate the eBay OAuth consent URL.
        The user visits this URL, grants access, and eBay redirects to their
        configured RuName URL with ?code=.... They copy the code and use the
        ebay-exchange-code endpoint to complete setup.
        """
        channel = self.get_object()
        creds = channel.api_credentials or {}
        app_id = (creds.get('app_id') or '').strip()
        ru_name = (creds.get('ru_name') or '').strip()
        sandbox = bool(creds.get('sandbox', False))

        if not app_id or not ru_name:
            return Response(
                {'error': 'Save App ID and RuName first before generating an auth URL.'},
                status=400,
            )

        from .integrations.ebay import EbayClient
        auth_url = EbayClient.build_auth_url(app_id=app_id, ru_name=ru_name, sandbox=sandbox)
        return Response({'auth_url': auth_url})

    @action(detail=True, methods=['post'], url_path='ebay-exchange-code')
    def ebay_exchange_code(self, request, pk=None):
        """
        Exchange an eBay OAuth authorization code for access + refresh tokens.
        Saves the tokens to channel.api_credentials.
        Body: {code: "v^1.1#i^1#..."}
        """
        channel = self.get_object()
        code = (request.data.get('code') or '').strip()
        if not code:
            return Response({'error': 'Provide the authorization code from eBay.'}, status=400)

        creds = channel.api_credentials or {}
        app_id = (creds.get('app_id') or '').strip()
        cert_id = (creds.get('cert_id') or '').strip()
        ru_name = (creds.get('ru_name') or '').strip()
        sandbox = bool(creds.get('sandbox', False))

        if not app_id or not cert_id or not ru_name:
            return Response(
                {'error': 'Save App ID, Cert ID, and RuName first.'},
                status=400,
            )

        from .integrations.ebay import EbayClient, EbayError
        try:
            token_data = EbayClient.exchange_code(
                app_id=app_id,
                cert_id=cert_id,
                ru_name=ru_name,
                code=code,
                sandbox=sandbox,
            )
            creds.update(token_data)
            channel.api_credentials = creds
            channel.status = Channel.STATUS_ACTIVE
            channel.save(update_fields=['api_credentials', 'status'])
            return Response({
                'ok': True,
                'message': 'eBay account connected successfully. Tokens saved.',
                'token_expires_at': token_data.get('token_expires_at'),
                'has_refresh_token': bool(token_data.get('refresh_token')),
            })
        except EbayError as exc:
            return Response({'error': str(exc)}, status=400)

    # ── Full sync ─────────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='sync')
    def sync(self, request, pk=None):
        """Full sync: import orders then push confirmed stock."""
        channel = self.get_object()
        log = _make_log(channel, 'full')
        try:
            if channel.channel_type == Channel.TYPE_EBAY:
                from .sync import import_ebay_orders, push_stock_to_ebay
                ostats = import_ebay_orders(channel, user=request.user)
                sstats = push_stock_to_ebay(channel)
            elif channel.channel_type == Channel.TYPE_AMAZON:
                from .sync import import_amazon_orders, push_stock_to_amazon
                ostats = import_amazon_orders(channel, user=request.user)
                sstats = push_stock_to_amazon(channel)
            else:
                from .sync import import_woocommerce_orders, push_stock_to_woocommerce
                ostats = import_woocommerce_orders(channel, user=request.user)
                sstats = push_stock_to_woocommerce(channel)
            msg = (
                f"Orders: {ostats['created']} imported, {ostats.get('duplicate', 0)} dup, "
                f"{ostats['failed']} failed. "
                f"Stock: {sstats['success']} pushed"
                + (f", {sstats['not_confirmed']} awaiting confirmation" if sstats.get('not_confirmed') else '')
                + (f", {sstats['failed']} failed" if sstats['failed'] else '')
                + "."
            )
            _complete_log(
                log,
                records_created=ostats['created'],
                records_processed=ostats['processed'],
                records_updated=sstats['success'],
                records_failed=ostats['failed'] + sstats['failed'],
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
            logger.error("Full sync failed for %s: %s", channel.name, exc, exc_info=True)
            return Response({'error': str(exc)}, status=500)

    # ── Import orders ─────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='sync-orders')
    def sync_orders(self, request, pk=None):
        channel = self.get_object()
        log = _make_log(channel, 'import_orders')
        try:
            if channel.channel_type == Channel.TYPE_EBAY:
                from .sync import import_ebay_orders
                stats = import_ebay_orders(channel, user=request.user)
            elif channel.channel_type == Channel.TYPE_AMAZON:
                from .sync import import_amazon_orders
                stats = import_amazon_orders(channel, user=request.user)
            else:
                from .sync import import_woocommerce_orders
                stats = import_woocommerce_orders(channel, user=request.user)
            msg = (
                f"Imported {stats['created']} new orders, "
                f"{stats.get('duplicate', 0)} duplicates skipped, "
                f"{stats['failed']} failed "
                f"({stats['processed']} total processed)."
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
        """
        Push stock for CONFIRMED (is_active=True) ChannelListings only.
        Query param: ?dry_run=true — calculates and logs what would be pushed, makes no API calls.
        """
        channel = self.get_object()
        dry_run = request.query_params.get('dry_run', '').lower() in ('1', 'true', 'yes')
        log = _make_log(channel, 'push_stock')
        try:
            if channel.channel_type == Channel.TYPE_EBAY:
                from .sync import push_stock_to_ebay
                stats = push_stock_to_ebay(channel, dry_run=dry_run)
            elif channel.channel_type == Channel.TYPE_AMAZON:
                from .sync import push_stock_to_amazon
                stats = push_stock_to_amazon(channel, dry_run=dry_run)
            else:
                from .sync import push_stock_to_woocommerce
                stats = push_stock_to_woocommerce(channel)

            if dry_run:
                is_ebay = channel.channel_type == Channel.TYPE_EBAY
                is_amazon = channel.channel_type == Channel.TYPE_AMAZON
                if is_ebay:
                    sku_label = 'eBay SKU'
                    sku_key = 'ebay_sku'
                    platform = 'eBay'
                elif is_amazon:
                    sku_label = 'Seller SKU'
                    sku_key = 'amazon_sku'
                    platform = 'Amazon'
                else:
                    sku_label = 'SKU'
                    sku_key = 'external_sku'
                    platform = channel.channel_type

                preview_lines = [
                    f"  {p['erp_sku']} → {sku_label} {p[sku_key]} qty={p['qty']}"
                    for p in stats.get('preview', [])
                ] or [f'  (no confirmed active mappings with a {sku_label} set)']
                msg = (
                    f"DRY RUN — {stats['success']} listing(s) would be updated:\n"
                    + '\n'.join(preview_lines)
                    + (f"\n{stats['skipped']} skipped (no external_sku set)." if stats.get('skipped') else '')
                    + (f"\n{stats['not_confirmed']} mappings awaiting activation." if stats.get('not_confirmed') else '')
                    + f'\nNo changes were made to {platform}.'
                )
                log.status = 'completed'
                log.message = msg
                log.completed_at = timezone.now()
                log.records_processed = stats['success']
                log.save()
                return Response({**ChannelSyncLogSerializer(log).data, 'dry_run': True, 'preview': stats.get('preview', [])})

            parts = [f"{stats['success']} updated"]
            if stats.get('failed'):
                parts.append(f"{stats['failed']} failed")
            if stats.get('legacy'):
                parts.append(f"{stats['legacy']} legacy listing(s) skipped (not in Inventory API)")
            if stats.get('skipped'):
                parts.append(f"{stats['skipped']} skipped (no inventory SKU set)")
            if stats.get('not_confirmed'):
                parts.append(
                    f"{stats['not_confirmed']} awaiting SKU confirmation (activate in SKU Mapping tab)"
                )
            msg = "Stock: " + ", ".join(parts) + "."

            errors = stats.get('errors', [])
            if errors:
                error_lines = []
                for e in errors[:20]:
                    prefix = '[LEGACY] ' if e.get('legacy') else '[ERROR] '
                    sku_key = 'ebay_sku' if 'ebay_sku' in e else 'amazon_sku'
                    ext_sku = e.get(sku_key, e.get('external_sku', ''))
                    error_lines.append(f"  {prefix}{e['erp_sku']} ({sku_key}: {ext_sku}): {e['error']}")
                msg += '\n\nDetails:\n' + '\n'.join(error_lines)
                if len(errors) > 20:
                    msg += f'\n  … and {len(errors) - 20} more.'

            _complete_log(
                log,
                records_processed=stats['success'] + stats.get('failed', 0) + stats.get('skipped', 0),
                records_updated=stats['success'],
                records_failed=stats.get('failed', 0),
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
        """
        Push tracking to WooCommerce for a dispatched order.
        Accepts order_id (ERP PK), order_number (e.g. SO20260426001), or wc_order_id.
        Optional overrides: tracking_number, courier, tracking_url.
        """
        channel = self.get_object()
        from sales.models import SalesOrder
        from .sync import push_tracking_to_woocommerce

        order_id = request.data.get('order_id')
        order_number = request.data.get('order_number')
        wc_order_id = request.data.get('wc_order_id')

        try:
            if order_id:
                so = SalesOrder.objects.get(pk=order_id)
            elif order_number:
                so = SalesOrder.objects.get(order_number=order_number)
            elif wc_order_id:
                mp = MarketplaceOrder.objects.get(
                    channel=channel, external_order_id=str(wc_order_id)
                )
                so = mp.sales_order
            else:
                return Response(
                    {'error': 'Provide order_id, order_number, or wc_order_id'},
                    status=400,
                )
        except (SalesOrder.DoesNotExist, MarketplaceOrder.DoesNotExist):
            return Response({'error': 'Order not found'}, status=404)

        log = _make_log(channel, 'push_tracking')

        if channel.channel_type == Channel.TYPE_EBAY:
            from .sync import push_tracking_to_ebay
            result = push_tracking_to_ebay(
                channel, so,
                tracking_number=request.data.get('tracking_number') or None,
                courier_override=request.data.get('courier') or None,
            )
            if result['success']:
                _complete_log(
                    log,
                    records_updated=1,
                    message=(
                        f"eBay: Pushed tracking {result['tracking']} "
                        f"(carrier: {result.get('carrier', 'OTHER')}) to order {result.get('order_id')}."
                    ),
                )
                return Response({'ok': True, 'message': log.message})
        elif channel.channel_type == Channel.TYPE_AMAZON:
            from .sync import push_tracking_to_amazon
            result = push_tracking_to_amazon(
                channel, so,
                tracking_number=request.data.get('tracking_number') or None,
                courier_override=request.data.get('courier') or None,
            )
            if result['success']:
                _complete_log(
                    log,
                    records_updated=1,
                    message=(
                        f"Amazon: Pushed tracking {result['tracking']} "
                        f"(carrier: {result.get('carrier', 'Other')}) to order {result.get('order_id')}."
                    ),
                )
                return Response({'ok': True, 'message': log.message})
        else:
            result = push_tracking_to_woocommerce(
                channel, so,
                tracking_number=request.data.get('tracking_number') or None,
                courier_override=request.data.get('courier') or None,
                tracking_url_override=request.data.get('tracking_url') or None,
            )
            if result['success']:
                _complete_log(
                    log,
                    records_updated=1,
                    message=(
                        f"Pushed tracking {result['tracking']} "
                        f"({result.get('courier', '')}) to WC#{result.get('wc_order_id')}."
                    ),
                )
                return Response({'ok': True, 'message': log.message})

        _fail_log(log, result['error'])
        return Response({'ok': False, 'error': result['error']}, status=400)

    # ── SKU mappings ──────────────────────────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='sku-mappings')
    def sku_mappings(self, request, pk=None):
        """
        GET  — list all ChannelListings for this channel type.
        POST — create / update a mapping. Passing product + external_id is required.
               If a listing already exists for that product+channel+external_id, it is updated.
               Creating a mapping auto-backfills unmatched SalesOrderItems with the same SKU.
        """
        channel = self.get_object()
        from products.models import ChannelListing, Product

        if request.method == 'GET':
            listings = (
                ChannelListing.objects
                .filter(channel=channel.channel_type)
                .select_related('product')
                .order_by('product__sku')
            )
            return Response(ChannelListingDetailSerializer(listings, many=True).data)

        # POST — create / confirm a mapping
        data = request.data
        product_id = data.get('product')
        erp_sku = (data.get('sku') or '').strip()  # ERP product SKU (alternative to product ID)
        external_id = (data.get('external_id') or '').strip()
        external_sku = (data.get('external_sku') or '').strip()
        parent_id = (data.get('parent_id') or '').strip()

        if not product_id and not erp_sku:
            return Response(
                {'error': 'Provide product (ERP product ID) or sku (ERP product SKU)'},
                status=400,
            )
        if not external_id and not external_sku:
            return Response(
                {'error': 'Provide at least external_id or external_sku'},
                status=400,
            )

        try:
            if product_id:
                product = Product.objects.get(pk=product_id)
            else:
                product = Product.objects.get(sku__iexact=erp_sku)
        except Product.DoesNotExist:
            return Response(
                {'error': f'Product not found (sku={erp_sku!r})' if erp_sku else 'Product not found'},
                status=404,
            )

        listing, created = ChannelListing.objects.update_or_create(
            product=product,
            channel=channel.channel_type,
            external_id=external_id,
            defaults={
                'external_sku': external_sku or product.sku,
                'parent_id': parent_id,
                'channel_price': data.get('channel_price') or None,
                'is_active': True,  # user-created = confirmed for stock sync
            },
        )

        # Backfill: fix any existing SalesOrderItems that had this SKU but no product
        if external_sku:
            from sales.models import SalesOrderItem
            fixed = SalesOrderItem.objects.filter(
                order__channel=channel.channel_type,
                sku__iexact=external_sku,
                product__isnull=True,
            ).update(product=product, buy_price_at_time=product.buy_price)
            if fixed:
                logger.info("Backfilled %d order items with product %s", fixed, product.sku)

        listing.refresh_from_db()
        listing.product  # ensure prefetch
        return Response(
            ChannelListingDetailSerializer(listing).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['patch', 'delete'], url_path='sku-mapping')
    def sku_mapping_update(self, request, pk=None):
        """
        PATCH  — update a single ChannelListing (e.g. toggle is_active).
        DELETE — remove a ChannelListing.
        Requires listing_id in the request body (PATCH/DELETE) or query param (DELETE).
        """
        channel = self.get_object()
        from products.models import ChannelListing

        listing_id = (
            request.data.get('listing_id')
            or request.query_params.get('listing_id')
        )
        if not listing_id:
            return Response({'error': 'listing_id is required'}, status=400)

        try:
            listing = ChannelListing.objects.select_related('product').get(
                pk=listing_id, channel=channel.channel_type
            )
        except ChannelListing.DoesNotExist:
            return Response({'error': 'Mapping not found'}, status=404)

        if request.method == 'DELETE':
            listing.delete()
            return Response(status=204)

        # PATCH — update allowed fields
        updatable = ['external_sku', 'external_id', 'parent_id', 'is_active', 'channel_price']
        for field in updatable:
            if field in request.data:
                setattr(listing, field, request.data[field])
        listing.save()
        listing.refresh_from_db()
        return Response(ChannelListingDetailSerializer(listing).data)

    # ── Unmatched orders ──────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='unmatched-orders')
    def unmatched_orders(self, request, pk=None):
        """
        Orders imported from this channel that have at least one item with product=None.
        Returned grouped by order, showing only the unmatched items.
        """
        channel = self.get_object()
        from sales.models import SalesOrder

        unmatched_order_ids = (
            channel.marketplace_orders
            .filter(
                status=MarketplaceOrder.STATUS_IMPORTED,
                sales_order__items__product__isnull=True,
            )
            .values_list('sales_order_id', flat=True)
            .distinct()
        )

        orders = (
            SalesOrder.objects
            .filter(pk__in=unmatched_order_ids)
            .prefetch_related('items')
            .order_by('-created_at')[:50]
        )

        result = []
        for so in orders:
            unmatched_items = [
                {
                    'id': item.id,
                    'sku': item.sku,
                    'title': item.title,
                    'quantity': item.quantity,
                }
                for item in so.items.all()
                if item.product_id is None
            ]
            if unmatched_items:
                result.append({
                    'order_id': so.id,
                    'order_number': so.order_number,
                    'created_at': so.created_at.isoformat(),
                    'status': so.status,
                    'total_value': str(so.total_value),
                    'unmatched_items': unmatched_items,
                })
        return Response(result)

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
