from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Return
from .serializers import ReturnSerializer


class ReturnViewSet(viewsets.ModelViewSet):
    queryset = Return.objects.select_related(
        'sales_order', 'customer', 'created_by'
    ).prefetch_related('items').all()
    serializer_class = ReturnSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'reason', 'resolution', 'customer']
    search_fields = ['rma_number', 'sales_order__order_number', 'customer__company_name',
                     'return_tracking_number', 'description']
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        order = serializer.validated_data.get('sales_order')
        customer = serializer.validated_data.get('customer') or (order.customer if order else None)
        serializer.save(created_by=self.request.user, customer=customer)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        ret = self.get_object()
        ret.status = Return.STATUS_APPROVED
        ret.save(update_fields=['status'])
        return Response({'detail': 'Return approved.'})

    @action(detail=True, methods=['post'], url_path='mark-received')
    def mark_received(self, request, pk=None):
        import datetime
        ret = self.get_object()
        ret.status = Return.STATUS_RECEIVED
        ret.return_received_date = datetime.date.today()
        ret.save(update_fields=['status', 'return_received_date'])
        return Response({'detail': 'Return received.'})

    @action(detail=True, methods=['post'], url_path='process-refund')
    def process_refund(self, request, pk=None):
        ret = self.get_object()
        amount = request.data.get('refund_amount', ret.refund_amount)
        ret.refund_amount = amount
        ret.resolution = Return.RESOLUTION_REFUND
        ret.status = Return.STATUS_REFUNDED
        ret.handled_by = request.user
        ret.save(update_fields=['refund_amount', 'resolution', 'status', 'handled_by'])
        return Response({'detail': f'Refund of £{amount} processed.'})
