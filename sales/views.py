from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as df_filters
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import SalesOrder, SalesOrderItem, OrderNote
from .serializers import SalesOrderSerializer, SalesOrderListSerializer, OrderNoteSerializer


class SalesOrderFilter(df_filters.FilterSet):
    """Allow comma-separated values for status and payment_status filters.
    e.g. ?status=confirmed,processing,awaiting_dispatch"""
    status = df_filters.BaseInFilter(field_name='status', lookup_expr='in')
    payment_status = df_filters.BaseInFilter(field_name='payment_status', lookup_expr='in')
    channel = df_filters.CharFilter(field_name='channel', lookup_expr='exact')

    class Meta:
        model = SalesOrder
        fields = ['status', 'channel', 'payment_status']


class SalesOrderViewSet(viewsets.ModelViewSet):
    queryset = SalesOrder.objects.select_related('customer').prefetch_related(
        'items__product', 'order_notes'
    ).all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SalesOrderFilter
    search_fields = ['order_number', 'external_order_id', 'ship_to_name', 'ship_to_email',
                     'ship_to_postcode', 'customer__company_name', 'customer__email',
                     'marketplace_order_id']
    ordering_fields = ['order_number', 'total_value', 'created_at', 'dispatched_date']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return SalesOrderListSerializer
        return SalesOrderSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='dispatch')
    def dispatch_order(self, request, pk=None):
        order = self.get_object()
        if order.status not in [SalesOrder.STATUS_PROCESSING, SalesOrder.STATUS_AWAITING_DISPATCH, SalesOrder.STATUS_CONFIRMED]:
            return Response({'detail': 'Order cannot be dispatched in current status.'}, status=400)
        tracking = request.data.get('tracking_number', '')
        courier = request.data.get('courier', 'evri')
        cost = request.data.get('cost', 0)

        with transaction.atomic():
            order.status = SalesOrder.STATUS_DISPATCHED
            order.dispatched_date = timezone.now().date()
            order.save(update_fields=['status', 'dispatched_date'])

            from shipping.models import Shipment
            shipment = Shipment.objects.create(
                sales_order=order,
                courier=courier,
                tracking_number=tracking,
                status=Shipment.STATUS_DISPATCHED,
                cost=cost,
                dispatched_at=timezone.now(),
                created_by=request.user,
            )

            # Deduct stock
            from products.models import StockLevel, StockMovement, StockLocation
            default_location = StockLocation.objects.filter(is_active=True).first()
            if default_location:
                for item in order.items.all():
                    if item.product:
                        level, _ = StockLevel.objects.get_or_create(
                            product=item.product, location=default_location,
                            defaults={'qty_on_hand': 0}
                        )
                        qty_before = level.qty_on_hand
                        level.qty_on_hand = max(0, level.qty_on_hand - item.quantity)
                        level.qty_reserved = max(0, level.qty_reserved - item.quantity)
                        level.save()
                        StockMovement.objects.create(
                            product=item.product, location=default_location,
                            movement_type=StockMovement.TYPE_OUTWARD,
                            quantity=-item.quantity,
                            qty_before=qty_before,
                            qty_after=level.qty_on_hand,
                            reference_type='sales_order',
                            reference_id=str(order.pk),
                            reference_number=order.order_number,
                            created_by=request.user,
                        )

        OrderNote.objects.create(
            order=order, note_type=OrderNote.TYPE_SYSTEM,
            content=f"Order dispatched. Tracking: {tracking} via {courier}",
            created_by=request.user,
        )
        from audit.utils import log_action
        log_action(request, 'update', 'SalesOrder', str(order.pk), str(order), {'status': 'dispatched', 'tracking': tracking})
        return Response({'detail': 'Order dispatched.', 'tracking_number': tracking})

    @action(detail=True, methods=['post'], url_path='mark-processing')
    def mark_processing(self, request, pk=None):
        order = self.get_object()
        if order.status == SalesOrder.STATUS_PROCESSING:
            return Response({'detail': 'Already in processing.'})
        if order.status != SalesOrder.STATUS_CONFIRMED:
            return Response({'detail': 'Only confirmed orders can be marked as processing.'}, status=400)
        order.status = SalesOrder.STATUS_PROCESSING
        order.save(update_fields=['status'])
        OrderNote.objects.create(
            order=order, note_type=OrderNote.TYPE_SYSTEM,
            content=f"Picking started by {request.user.get_full_name() or request.user.username}",
            created_by=request.user,
        )
        return Response({'detail': 'Order marked as processing.'})

    @action(detail=True, methods=['post'], url_path='mark-ready')
    def mark_ready_to_dispatch(self, request, pk=None):
        order = self.get_object()
        if order.status == SalesOrder.STATUS_AWAITING_DISPATCH:
            return Response({'detail': 'Already awaiting dispatch.'})
        if order.status not in [SalesOrder.STATUS_CONFIRMED, SalesOrder.STATUS_PROCESSING]:
            return Response({'detail': 'Order cannot be marked ready in current status.'}, status=400)
        order.status = SalesOrder.STATUS_AWAITING_DISPATCH
        order.save(update_fields=['status'])
        OrderNote.objects.create(
            order=order, note_type=OrderNote.TYPE_SYSTEM,
            content=f"Picking complete — ready to dispatch. Confirmed by {request.user.get_full_name() or request.user.username}",
            created_by=request.user,
        )
        from audit.utils import log_action
        log_action(request, 'update', 'SalesOrder', str(order.pk), str(order), {'status': 'awaiting_dispatch'})
        return Response({'detail': 'Order marked as ready to dispatch.'})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_order(self, request, pk=None):
        order = self.get_object()
        if order.status in [SalesOrder.STATUS_DISPATCHED, SalesOrder.STATUS_DELIVERED, SalesOrder.STATUS_COMPLETED]:
            return Response({'detail': 'Cannot cancel a dispatched or completed order.'}, status=400)
        order.status = SalesOrder.STATUS_CANCELLED
        order.save(update_fields=['status'])
        OrderNote.objects.create(
            order=order, note_type=OrderNote.TYPE_SYSTEM,
            content=f"Order cancelled by {request.user.get_full_name()}",
            created_by=request.user,
        )
        return Response({'detail': 'Order cancelled.'})

    @action(detail=True, methods=['post'], url_path='add-note')
    def add_note(self, request, pk=None):
        order = self.get_object()
        serializer = OrderNoteSerializer(data={**request.data, 'order': order.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user, order=order)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['get'], url_path='stock-status')
    def stock_status(self, request):
        """Return {order_id: has_issue} for all orders matching the given comma-separated statuses."""
        status_param = request.query_params.get('status', '')
        statuses = [s.strip() for s in status_param.split(',') if s.strip()]
        if not statuses:
            return Response({})

        from products.models import StockLevel

        orders = list(SalesOrder.objects.filter(status__in=statuses).prefetch_related('items__product'))

        product_ids = set()
        for order in orders:
            for item in order.items.all():
                if item.product_id:
                    product_ids.add(item.product_id)

        stock_by_product = {}
        if product_ids:
            for sl in StockLevel.objects.filter(product_id__in=product_ids).values('product_id', 'qty_on_hand', 'qty_reserved'):
                avail = (sl['qty_on_hand'] or 0) - (sl['qty_reserved'] or 0)
                stock_by_product[sl['product_id']] = stock_by_product.get(sl['product_id'], 0) + avail

        result = {}
        for order in orders:
            has_issue = False
            for item in order.items.all():
                if item.product_id and stock_by_product.get(item.product_id, 0) < item.quantity:
                    has_issue = True
                    break
            result[str(order.id)] = has_issue

        return Response(result)

    @action(detail=True, methods=['post'], url_path='update-payment')
    def update_payment(self, request, pk=None):
        order = self.get_object()
        pay_status = request.data.get('payment_status')
        valid = [c[0] for c in SalesOrder.PAYMENT_STATUS_CHOICES]
        if pay_status not in valid:
            return Response({'detail': f'Invalid status. Choose from {valid}'}, status=400)
        order.payment_status = pay_status
        order.save(update_fields=['payment_status'])
        return Response({'detail': 'Payment status updated.'})


class OrderNoteViewSet(viewsets.ModelViewSet):
    queryset = OrderNote.objects.select_related('created_by').all()
    serializer_class = OrderNoteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['order', 'note_type', 'is_pinned']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
