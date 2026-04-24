from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Supplier, SupplierProduct, SupplierIssue
from .serializers import SupplierSerializer, SupplierListSerializer, SupplierProductSerializer, SupplierIssueSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.prefetch_related('supplier_products__product').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'payment_terms', 'country']
    search_fields = ['name', 'code', 'contact_name', 'email', 'phone', 'account_number']
    ordering_fields = ['name', 'code', 'created_at']
    ordering = ['name']

    def get_serializer_class(self):
        if self.action == 'list':
            return SupplierListSerializer
        return SupplierSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='orders')
    def orders(self, request, pk=None):
        supplier = self.get_object()
        from purchasing.models import PurchaseOrder
        from purchasing.serializers import PurchaseOrderListSerializer
        orders = PurchaseOrder.objects.filter(supplier=supplier).order_by('-created_at')[:50]
        return Response(PurchaseOrderListSerializer(orders, many=True).data)

    @action(detail=True, methods=['get'], url_path='issues')
    def issues(self, request, pk=None):
        supplier = self.get_object()
        issues = supplier.issues.all()
        return Response(SupplierIssueSerializer(issues, many=True).data)


class SupplierProductViewSet(viewsets.ModelViewSet):
    queryset = SupplierProduct.objects.select_related('supplier', 'product').all()
    serializer_class = SupplierProductSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['supplier', 'product', 'is_preferred']
    search_fields = ['supplier__name', 'product__sku', 'supplier_sku']


class SupplierIssueViewSet(viewsets.ModelViewSet):
    queryset = SupplierIssue.objects.select_related('supplier', 'reported_by').all()
    serializer_class = SupplierIssueSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['supplier', 'issue_type', 'status']
    search_fields = ['title', 'supplier__name', 'purchase_order_ref']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)
