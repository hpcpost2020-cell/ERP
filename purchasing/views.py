from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.utils import timezone

from .models import PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem, SupplierCreditNote
from .serializers import (
    PurchaseOrderSerializer, PurchaseOrderListSerializer,
    GoodsReceiptSerializer, SupplierCreditNoteSerializer
)
from products.models import StockLevel, StockMovement


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related(
        'supplier', 'created_by'
    ).prefetch_related('items__product', 'goods_receipts__items').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'supplier', 'is_overdue']
    search_fields = ['po_number', 'supplier__name', 'supplier_reference', 'notes']
    ordering_fields = ['po_number', 'order_date', 'expected_delivery_date', 'created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseOrderListSerializer
        return PurchaseOrderSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='send')
    def send_to_supplier(self, request, pk=None):
        po = self.get_object()
        if po.status != PurchaseOrder.STATUS_DRAFT:
            return Response({'detail': 'Only draft POs can be sent.'}, status=400)
        po.status = PurchaseOrder.STATUS_SENT
        po.save(update_fields=['status'])
        from audit.utils import log_action
        log_action(request, 'update', 'PurchaseOrder', str(po.pk), str(po), {'status': 'sent'})
        return Response({'detail': 'PO marked as sent to supplier.'})

    @action(detail=True, methods=['post'], url_path='receive')
    def receive_items(self, request, pk=None):
        po = self.get_object()
        if po.status in [PurchaseOrder.STATUS_CLOSED, PurchaseOrder.STATUS_CANCELLED]:
            return Response({'detail': 'Cannot receive against a closed or cancelled PO.'}, status=400)
        serializer = GoodsReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            receipt = serializer.save(purchase_order=po, received_by=request.user)

            default_location = None
            from products.models import StockLocation
            default_location = StockLocation.objects.filter(is_active=True).first()

            for receipt_item in receipt.items.all():
                po_item = receipt_item.po_item
                qty = receipt_item.qty_received
                po_item.qty_received = (po_item.qty_received or 0) + qty
                po_item.qty_damaged = (po_item.qty_damaged or 0) + receipt_item.qty_damaged
                po_item.save(update_fields=['qty_received', 'qty_damaged'])

                if default_location and qty > 0:
                    level, _ = StockLevel.objects.get_or_create(
                        product=po_item.product,
                        location=default_location,
                        defaults={'qty_on_hand': 0}
                    )
                    qty_before = level.qty_on_hand
                    level.qty_on_hand += qty
                    level.save(update_fields=['qty_on_hand'])
                    StockMovement.objects.create(
                        product=po_item.product,
                        location=default_location,
                        movement_type=StockMovement.TYPE_INWARD,
                        quantity=qty,
                        qty_before=qty_before,
                        qty_after=level.qty_on_hand,
                        reference_type='purchase_order',
                        reference_id=str(po.pk),
                        reference_number=po.po_number,
                        unit_cost=po_item.unit_cost,
                        notes=f"Received via GR {receipt.receipt_number}",
                        created_by=request.user,
                    )
                    po_item.product.buy_price = po_item.unit_cost
                    po_item.product.save(update_fields=['buy_price'])

            if po.is_fully_received:
                po.status = PurchaseOrder.STATUS_RECEIVED
                po.actual_delivery_date = receipt.received_date
            elif any(i.qty_received > 0 for i in po.items.all()):
                po.status = PurchaseOrder.STATUS_PART_RECEIVED
            po.save(update_fields=['status', 'actual_delivery_date'])

        from audit.utils import log_action
        log_action(request, 'create', 'GoodsReceipt', str(receipt.pk), str(receipt), {})
        return Response(GoodsReceiptSerializer(receipt).data, status=201)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        po = self.get_object()
        if po.status in [PurchaseOrder.STATUS_RECEIVED, PurchaseOrder.STATUS_CLOSED]:
            return Response({'detail': 'Cannot cancel a received or closed PO.'}, status=400)
        po.status = PurchaseOrder.STATUS_CANCELLED
        po.save(update_fields=['status'])
        return Response({'detail': 'PO cancelled.'})


class SupplierCreditNoteViewSet(viewsets.ModelViewSet):
    queryset = SupplierCreditNote.objects.select_related('supplier').all()
    serializer_class = SupplierCreditNoteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['supplier', 'status']
    search_fields = ['credit_note_number', 'supplier__name', 'reason']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
