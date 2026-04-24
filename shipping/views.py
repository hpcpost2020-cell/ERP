from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from .models import Shipment, CourierIssue
from .serializers import ShipmentSerializer, CourierIssueSerializer


class ShipmentViewSet(viewsets.ModelViewSet):
    queryset = Shipment.objects.select_related('sales_order', 'created_by').prefetch_related('issues').all()
    serializer_class = ShipmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['courier', 'status', 'sales_order']
    search_fields = ['tracking_number', 'sales_order__order_number', 'notes']
    ordering_fields = ['created_at', 'dispatched_at', 'delivered_at']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='mark-delivered')
    def mark_delivered(self, request, pk=None):
        shipment = self.get_object()
        shipment.status = Shipment.STATUS_DELIVERED
        shipment.delivered_at = timezone.now()
        shipment.save(update_fields=['status', 'delivered_at'])
        order = shipment.sales_order
        order.status = 'delivered'
        order.save(update_fields=['status'])
        return Response({'detail': 'Marked as delivered.'})

    @action(detail=True, methods=['post'], url_path='report-issue')
    def report_issue(self, request, pk=None):
        shipment = self.get_object()
        serializer = CourierIssueSerializer(data={**request.data, 'shipment': shipment.pk})
        serializer.is_valid(raise_exception=True)
        serializer.save(reported_by=request.user, shipment=shipment)
        return Response(serializer.data, status=201)


class CourierIssueViewSet(viewsets.ModelViewSet):
    queryset = CourierIssue.objects.select_related('shipment__sales_order', 'reported_by').all()
    serializer_class = CourierIssueSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['issue_type', 'status', 'shipment']
    search_fields = ['description', 'shipment__tracking_number', 'claim_reference']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)
