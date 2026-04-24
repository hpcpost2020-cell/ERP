from rest_framework import serializers
from .models import Supplier, SupplierProduct, SupplierPriceHistory, SupplierIssue


class SupplierProductSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)

    class Meta:
        model = SupplierProduct
        fields = ['id', 'supplier', 'product', 'product_sku', 'product_title',
                  'supplier_sku', 'supplier_description', 'buy_price', 'pack_size',
                  'lead_time_days', 'is_preferred', 'last_ordered_date', 'notes', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class SupplierPriceHistorySerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)

    class Meta:
        model = SupplierPriceHistory
        fields = ['id', 'supplier_product', 'buy_price', 'recorded_at', 'recorded_by_name', 'notes']
        read_only_fields = ['id', 'recorded_at']


class SupplierIssueSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True)

    class Meta:
        model = SupplierIssue
        fields = ['id', 'supplier', 'issue_type', 'status', 'title', 'description',
                  'purchase_order_ref', 'resolution', 'reported_by', 'reported_by_name',
                  'resolved_by', 'created_at', 'resolved_at']
        read_only_fields = ['id', 'created_at', 'reported_by']


class SupplierListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'code', 'contact_name', 'email', 'phone',
                  'status', 'payment_terms', 'lead_time_days', 'currency']


class SupplierSerializer(serializers.ModelSerializer):
    supplier_products = SupplierProductSerializer(many=True, read_only=True)
    open_issues_count = serializers.SerializerMethodField()
    total_po_value = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = ['id', 'name', 'code', 'contact_name', 'email', 'phone', 'website',
                  'address_line1', 'address_line2', 'city', 'county', 'postcode', 'country',
                  'payment_terms', 'credit_limit', 'currency', 'lead_time_days',
                  'minimum_order_value', 'account_number', 'vat_number', 'status', 'notes',
                  'supplier_products', 'open_issues_count', 'total_po_value',
                  'created_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def get_open_issues_count(self, obj):
        return obj.issues.filter(status__in=['open', 'in_progress']).count()

    def get_total_po_value(self, obj):
        from purchasing.models import PurchaseOrder
        from django.db.models import Sum
        result = PurchaseOrder.objects.filter(supplier=obj).aggregate(
            total=Sum('items__unit_cost')
        )
        return result['total'] or 0
