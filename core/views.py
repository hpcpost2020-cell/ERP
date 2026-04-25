from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q

from .models import SystemSetting
from .serializers import SystemSettingSerializer, SystemSettingBulkSerializer


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.select_related('updated_by').all()
    serializer_class = SystemSettingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_sensitive']
    search_fields = ['key', 'description']
    ordering_fields = ['key', 'updated_at']
    ordering = ['key']
    lookup_field = 'key'

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk_update(self, request):
        serializer = SystemSettingBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        settings_dict = serializer.validated_data['settings']
        updated = []
        for key, value in settings_dict.items():
            obj, _ = SystemSetting.objects.update_or_create(
                key=key,
                defaults={'value': value, 'updated_by': request.user}
            )
            updated.append(key)
        return Response({'updated': updated, 'count': len(updated)})

    @action(detail=False, methods=['get'], url_path='by-prefix')
    def by_prefix(self, request):
        """Retrieve all settings matching a key prefix, e.g. ?prefix=company"""
        prefix = request.query_params.get('prefix', '')
        qs = self.get_queryset().filter(key__startswith=prefix)
        return Response(SystemSettingSerializer(qs, many=True).data)


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if not q or len(q) < 2:
            return Response({'detail': 'Query must be at least 2 characters.', 'results': {}, 'total': 0})

        types_param = request.query_params.get('types', '')
        all_types = ['products', 'orders', 'customers', 'suppliers', 'purchase_orders', 'invoices', 'returns']
        if types_param:
            types = [t.strip() for t in types_param.split(',') if t.strip() in all_types]
        else:
            types = all_types

        results = {}

        if 'products' in types:
            from products.models import Product
            rows = Product.objects.filter(
                Q(sku__icontains=q) | Q(title__icontains=q) | Q(barcode__icontains=q) | Q(brand__icontains=q)
            ).values('id', 'sku', 'title', 'status')[:10]
            results['products'] = [
                {'id': r['id'], 'type': 'product', 'label': f"[{r['sku']}] {r['title']}", 'subtitle': r['status']}
                for r in rows
            ]

        if 'orders' in types:
            from sales.models import SalesOrder
            rows = SalesOrder.objects.filter(
                Q(order_number__icontains=q) | Q(ship_to_name__icontains=q) |
                Q(ship_to_email__icontains=q) | Q(external_order_id__icontains=q)
            ).select_related('customer').values(
                'id', 'order_number', 'ship_to_name', 'status', 'total_value'
            )[:10]
            results['orders'] = [
                {'id': r['id'], 'type': 'order', 'label': r['order_number'],
                 'subtitle': f"{r['ship_to_name']} — {r['status']}"}
                for r in rows
            ]

        if 'customers' in types:
            from customers.models import Customer
            rows = Customer.objects.filter(
                Q(customer_number__icontains=q) | Q(company_name__icontains=q) |
                Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
            ).values('id', 'customer_number', 'company_name', 'first_name', 'last_name', 'email')[:10]
            results['customers'] = [
                {'id': r['id'], 'type': 'customer',
                 'label': r['company_name'] or f"{r['first_name']} {r['last_name']}".strip(),
                 'subtitle': f"{r['customer_number']} · {r['email']}"}
                for r in rows
            ]

        if 'suppliers' in types:
            from suppliers.models import Supplier
            rows = Supplier.objects.filter(
                Q(name__icontains=q) | Q(code__icontains=q) |
                Q(contact_name__icontains=q) | Q(email__icontains=q)
            ).values('id', 'name', 'code', 'status')[:10]
            results['suppliers'] = [
                {'id': r['id'], 'type': 'supplier', 'label': r['name'],
                 'subtitle': f"{r['code']} — {r['status']}"}
                for r in rows
            ]

        if 'purchase_orders' in types:
            from purchasing.models import PurchaseOrder
            rows = PurchaseOrder.objects.filter(
                Q(po_number__icontains=q) | Q(supplier__name__icontains=q) |
                Q(supplier_reference__icontains=q)
            ).select_related('supplier').values('id', 'po_number', 'status', 'supplier__name')[:10]
            results['purchase_orders'] = [
                {'id': r['id'], 'type': 'purchase_order', 'label': r['po_number'],
                 'subtitle': f"{r['supplier__name']} — {r['status']}"}
                for r in rows
            ]

        if 'invoices' in types:
            from invoicing.models import Invoice
            rows = Invoice.objects.filter(
                Q(invoice_number__icontains=q) | Q(bill_to_name__icontains=q) |
                Q(customer__company_name__icontains=q)
            ).select_related('customer').values('id', 'invoice_number', 'status', 'total_amount')[:10]
            results['invoices'] = [
                {'id': r['id'], 'type': 'invoice', 'label': r['invoice_number'],
                 'subtitle': f"£{r['total_amount']} — {r['status']}"}
                for r in rows
            ]

        if 'returns' in types:
            from returns.models import Return
            rows = Return.objects.filter(
                Q(rma_number__icontains=q) | Q(sales_order__order_number__icontains=q) |
                Q(description__icontains=q)
            ).select_related('sales_order').values('id', 'rma_number', 'status', 'sales_order__order_number')[:10]
            results['returns'] = [
                {'id': r['id'], 'type': 'return', 'label': r['rma_number'],
                 'subtitle': f"Order {r['sales_order__order_number']} — {r['status']}"}
                for r in rows
            ]

        total = sum(len(v) for v in results.values())
        return Response({'query': q, 'results': results, 'total': total})
