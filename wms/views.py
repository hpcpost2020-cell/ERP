from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.utils import timezone

from .models import WarehouseZone, WarehouseLocation, PickingBatch, PickingBatchItem, StockLocationAssignment
from .serializers import (
    WarehouseZoneSerializer, WarehouseLocationSerializer, WarehouseLocationMinimalSerializer,
    PickingBatchSerializer, PickingBatchListSerializer, PickingBatchItemSerializer,
    StockLocationAssignmentSerializer, StockTransferSerializer, CycleCountSerializer,
)
from products.models import Product, StockMovement


class WarehouseZoneViewSet(viewsets.ModelViewSet):
    queryset = WarehouseZone.objects.all()
    serializer_class = WarehouseZoneSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['zone_type', 'is_active']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'code']
    ordering = ['name']


class WarehouseLocationViewSet(viewsets.ModelViewSet):
    queryset = WarehouseLocation.objects.select_related('zone').all()
    serializer_class = WarehouseLocationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['zone', 'location_type', 'is_active']
    search_fields = ['barcode', 'aisle', 'rack', 'shelf', 'bin', 'notes']
    ordering_fields = ['aisle', 'rack', 'shelf', 'bin']
    ordering = ['aisle', 'rack', 'shelf', 'bin']

    @action(detail=False, methods=['get'], url_path='by-barcode')
    def by_barcode(self, request):
        barcode = request.query_params.get('barcode', '').strip()
        if not barcode:
            return Response({'detail': 'barcode query param is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            loc = WarehouseLocation.objects.select_related('zone').get(barcode=barcode, is_active=True)
            return Response(WarehouseLocationSerializer(loc).data)
        except WarehouseLocation.DoesNotExist:
            return Response({'detail': 'Location not found.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], url_path='stock')
    def stock(self, request, pk=None):
        location = self.get_object()
        assignments = StockLocationAssignment.objects.select_related(
            'product', 'location'
        ).filter(location=location)
        return Response(StockLocationAssignmentSerializer(assignments, many=True).data)


class StockLocationAssignmentViewSet(viewsets.ModelViewSet):
    queryset = StockLocationAssignment.objects.select_related('product', 'location__zone').all()
    serializer_class = StockLocationAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['location', 'product', 'is_primary', 'location__zone']
    search_fields = ['product__sku', 'product__title', 'product__barcode', 'location__barcode']
    ordering_fields = ['location__aisle', 'product__sku', 'qty_on_hand', 'updated_at']
    ordering = ['location__aisle', 'location__rack']

    @action(detail=False, methods=['post'], url_path='transfer')
    def transfer(self, request):
        serializer = StockTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            product = Product.objects.get(pk=data['product'])
            from_loc = WarehouseLocation.objects.get(pk=data['from_location'])
            to_loc = WarehouseLocation.objects.get(pk=data['to_location'])
        except (Product.DoesNotExist, WarehouseLocation.DoesNotExist) as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        qty = data['quantity']
        notes = data.get('notes', '')

        with transaction.atomic():
            from_assign, _ = StockLocationAssignment.objects.get_or_create(
                product=product, location=from_loc, defaults={'qty_on_hand': 0}
            )
            if from_assign.qty_on_hand < qty:
                return Response(
                    {'detail': f'Insufficient stock at {from_loc}: {from_assign.qty_on_hand} available, {qty} requested.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            to_assign, _ = StockLocationAssignment.objects.get_or_create(
                product=product, location=to_loc, defaults={'qty_on_hand': 0, 'is_primary': False}
            )

            from_assign.qty_on_hand -= qty
            from_assign.save(update_fields=['qty_on_hand'])
            to_assign.qty_on_hand += qty
            to_assign.save(update_fields=['qty_on_hand'])

        from audit.utils import log_action
        log_action(
            request, 'update', 'StockLocationAssignment', str(product.pk),
            f"Transfer {product.sku}: {qty} units {from_loc} → {to_loc}",
            {'from': str(from_loc), 'to': str(to_loc), 'qty': qty}
        )
        return Response({
            'detail': f'Transferred {qty} x {product.sku} from {from_loc} to {to_loc}.',
            'from_qty_remaining': from_assign.qty_on_hand,
            'to_qty_new': to_assign.qty_on_hand,
        })

    @action(detail=True, methods=['post'], url_path='count')
    def count(self, request, pk=None):
        assignment = self.get_object()
        serializer = CycleCountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        counted_qty = data['counted_qty']
        notes = data.get('notes', '')
        variance = counted_qty - assignment.qty_on_hand

        assignment.qty_on_hand = counted_qty
        assignment.last_counted_at = timezone.now()
        assignment.last_counted_by = request.user
        assignment.save(update_fields=['qty_on_hand', 'last_counted_at', 'last_counted_by'])

        from audit.utils import log_action
        log_action(
            request, 'update', 'StockLocationAssignment', str(assignment.pk),
            f"Cycle count {assignment.product.sku} @ {assignment.location}: variance {variance:+d}",
            {'counted_qty': counted_qty, 'variance': variance, 'notes': notes}
        )
        return Response({
            'detail': 'Cycle count recorded.',
            'product_sku': assignment.product.sku,
            'location': str(assignment.location),
            'counted_qty': counted_qty,
            'variance': variance,
        })


class PickingBatchViewSet(viewsets.ModelViewSet):
    queryset = PickingBatch.objects.prefetch_related(
        'items__product', 'items__location__zone', 'items__sales_order'
    ).select_related('assigned_to', 'created_by').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'assigned_to']
    search_fields = ['batch_number', 'notes']
    ordering_fields = ['created_at', 'batch_number']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return PickingBatchListSerializer
        return PickingBatchSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='add-orders')
    def add_orders(self, request, pk=None):
        batch = self.get_object()
        if batch.status != PickingBatch.STATUS_OPEN:
            return Response({'detail': 'Can only add orders to an open batch.'}, status=status.HTTP_400_BAD_REQUEST)

        order_ids = request.data.get('order_ids', [])
        if not order_ids:
            return Response({'detail': 'order_ids list is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from sales.models import SalesOrder, SalesOrderItem
        added = 0
        for order_id in order_ids:
            try:
                order = SalesOrder.objects.prefetch_related('items__product').get(pk=order_id)
            except SalesOrder.DoesNotExist:
                continue
            for item in order.items.all():
                if item.product and not PickingBatchItem.objects.filter(batch=batch, order_item=item).exists():
                    location = StockLocationAssignment.objects.filter(
                        product=item.product, is_primary=True
                    ).select_related('location').first()
                    PickingBatchItem.objects.create(
                        batch=batch,
                        sales_order=order,
                        order_item=item,
                        product=item.product,
                        location=location.location if location else None,
                        qty_required=item.quantity,
                    )
                    added += 1

        return Response({'detail': f'Added {added} pick lines to batch {batch.batch_number}.'})

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        batch = self.get_object()
        user_id = request.data.get('user_id')
        if user_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                batch.assigned_to = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response({'detail': 'User not found.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            batch.assigned_to = request.user
        batch.save(update_fields=['assigned_to'])
        return Response({'detail': f'Batch assigned to {batch.assigned_to.get_full_name() or batch.assigned_to.username}.'})

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        batch = self.get_object()
        if batch.status != PickingBatch.STATUS_OPEN:
            return Response({'detail': 'Batch is not in Open status.'}, status=status.HTTP_400_BAD_REQUEST)
        batch.status = PickingBatch.STATUS_IN_PROGRESS
        batch.started_at = timezone.now()
        if not batch.assigned_to:
            batch.assigned_to = request.user
        batch.save(update_fields=['status', 'started_at', 'assigned_to'])
        return Response(PickingBatchSerializer(batch).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        batch = self.get_object()
        if batch.status == PickingBatch.STATUS_COMPLETED:
            return Response({'detail': 'Batch already completed.'}, status=status.HTTP_400_BAD_REQUEST)
        batch.status = PickingBatch.STATUS_COMPLETED
        batch.completed_at = timezone.now()
        batch.save(update_fields=['status', 'completed_at'])
        return Response({'detail': f'Batch {batch.batch_number} marked complete.'})

    @action(detail=True, methods=['post'], url_path='pick-item')
    def pick_item(self, request, pk=None):
        batch = self.get_object()
        item_id = request.data.get('item_id')
        qty_picked = request.data.get('qty_picked', 0)

        try:
            item = PickingBatchItem.objects.get(pk=item_id, batch=batch)
        except PickingBatchItem.DoesNotExist:
            return Response({'detail': 'Pick item not found in this batch.'}, status=status.HTTP_404_NOT_FOUND)

        item.qty_picked = qty_picked
        item.picked_by = request.user
        item.picked_at = timezone.now()
        if qty_picked >= item.qty_required:
            item.status = PickingBatchItem.STATUS_PICKED
        elif qty_picked > 0:
            item.status = PickingBatchItem.STATUS_SHORT
        item.save()

        return Response(PickingBatchItemSerializer(item).data)
