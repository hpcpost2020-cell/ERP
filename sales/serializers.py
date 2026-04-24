from rest_framework import serializers
from .models import SalesOrder, SalesOrderItem, OrderNote


class SalesOrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_vat = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = SalesOrderItem
        fields = ['id', 'order', 'product', 'sku', 'title', 'quantity',
                  'unit_price', 'discount_pct', 'vat_rate', 'buy_price_at_time',
                  'line_total', 'line_vat']
        read_only_fields = ['id', 'order']


class OrderNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = OrderNote
        fields = ['id', 'order', 'note_type', 'content', 'is_pinned',
                  'created_by', 'created_by_name', 'created_at']
        read_only_fields = ['id', 'created_at', 'created_by']


class SalesOrderListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrder
        fields = ['id', 'order_number', 'external_order_id', 'customer', 'customer_name',
                  'channel', 'status', 'payment_status',
                  'ship_to_name', 'ship_to_postcode',
                  'total_value', 'currency',
                  'dispatched_date', 'items_count', 'created_at']

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.display_name
        return obj.ship_to_name or obj.ship_to_company or ''

    def get_items_count(self, obj):
        return obj.items.count()


class SalesOrderSerializer(serializers.ModelSerializer):
    items = SalesOrderItemSerializer(many=True)
    order_notes = OrderNoteSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    estimated_margin = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    estimated_margin_pct = serializers.FloatField(read_only=True)

    class Meta:
        model = SalesOrder
        fields = ['id', 'order_number', 'external_order_id', 'customer', 'customer_name',
                  'channel', 'status', 'payment_status',
                  'ship_to_name', 'ship_to_company', 'ship_to_address1', 'ship_to_address2',
                  'ship_to_city', 'ship_to_county', 'ship_to_postcode', 'ship_to_country',
                  'ship_to_phone', 'ship_to_email',
                  'bill_to_name', 'bill_to_company', 'bill_to_address1',
                  'bill_to_city', 'bill_to_postcode', 'bill_to_country',
                  'subtotal', 'discount_amount', 'shipping_cost', 'vat_amount', 'total_value',
                  'currency', 'requested_delivery_date', 'dispatched_date',
                  'marketplace_fees', 'marketplace_order_id',
                  'notes', 'internal_notes',
                  'estimated_margin', 'estimated_margin_pct',
                  'items', 'order_notes',
                  'created_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'order_number', 'created_at', 'updated_at', 'created_by']

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.display_name
        return obj.ship_to_name or ''

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        order = SalesOrder.objects.create(**validated_data)
        for item_data in items_data:
            item_data['order'] = order
            if item_data.get('product') and not item_data.get('buy_price_at_time'):
                item_data['buy_price_at_time'] = item_data['product'].buy_price
            SalesOrderItem.objects.create(**item_data)
        order.recalculate_totals()
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                item_data['order'] = instance
                SalesOrderItem.objects.create(**item_data)
            instance.recalculate_totals()
        return instance
