from rest_framework import serializers
from .models import PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem, SupplierCreditNote


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)
    qty_outstanding = serializers.IntegerField(read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'purchase_order', 'product', 'product_sku', 'product_title',
            'supplier_sku', 'description', 'qty_ordered', 'qty_received', 'qty_damaged',
            'unit_cost', 'landed_unit_cost', 'qty_outstanding', 'line_total', 'notes',
        ]
        read_only_fields = ['id', 'purchase_order']


class GoodsReceiptItemSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='po_item.product.sku', read_only=True)
    product_title = serializers.CharField(source='po_item.product.title', read_only=True)
    product_barcode = serializers.CharField(source='po_item.product.barcode', read_only=True)
    qc_checked_by_name = serializers.CharField(source='qc_checked_by.get_full_name', read_only=True, allow_null=True)
    is_available_for_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = GoodsReceiptItem
        fields = [
            'id', 'po_item', 'product_sku', 'product_title', 'product_barcode',
            'qty_received', 'qty_damaged', 'notes',
            'qc_status', 'qc_checked_by', 'qc_checked_by_name',
            'qc_checked_at', 'qc_notes', 'qc_fail_reason', 'is_available_for_stock',
        ]
        read_only_fields = ['id', 'qc_checked_by', 'qc_checked_at', 'is_available_for_stock']


class GoodsReceiptSerializer(serializers.ModelSerializer):
    items = GoodsReceiptItemSerializer(many=True)
    received_by_name = serializers.CharField(source='received_by.get_full_name', read_only=True)

    class Meta:
        model = GoodsReceipt
        fields = ['id', 'purchase_order', 'receipt_number', 'received_date',
                  'delivery_note_ref', 'notes', 'items', 'received_by', 'received_by_name', 'created_at']
        read_only_fields = ['id', 'receipt_number', 'created_at', 'received_by', 'purchase_order']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        receipt = GoodsReceipt.objects.create(**validated_data)
        for item_data in items_data:
            GoodsReceiptItem.objects.create(goods_receipt=receipt, **item_data)
        return receipt


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier', 'supplier_name', 'status',
            'order_date', 'expected_delivery_date', 'total_value', 'items_count',
            'payment_terms', 'currency', 'created_at',
        ]
        read_only_fields = ['id', 'po_number', 'created_at']

    def get_items_count(self, obj):
        return obj.items.count()


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_received_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    goods_receipts = GoodsReceiptSerializer(many=True, read_only=True)

    total_landed_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_additional_charges = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'po_number', 'supplier', 'supplier_name', 'status',
            'order_date', 'expected_delivery_date', 'actual_delivery_date',
            'payment_terms', 'currency', 'exchange_rate', 'delivery_address', 'supplier_reference',
            'freight_cost', 'import_duty', 'other_charges',
            'notes', 'internal_notes', 'is_overdue',
            'total_value', 'total_received_value', 'total_additional_charges', 'total_landed_cost',
            'items', 'goods_receipts',
            'created_by', 'created_by_name', 'approved_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'po_number', 'created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        po = PurchaseOrder.objects.create(**validated_data)
        for item_data in items_data:
            PurchaseOrderItem.objects.create(purchase_order=po, **item_data)
        return po

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                PurchaseOrderItem.objects.create(purchase_order=instance, **item_data)
        return instance


class SupplierCreditNoteSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = SupplierCreditNote
        fields = ['id', 'supplier', 'supplier_name', 'purchase_order', 'credit_note_number',
                  'amount', 'reason', 'status', 'issued_date', 'expiry_date', 'created_at']
        read_only_fields = ['id', 'created_at']
