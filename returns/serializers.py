from rest_framework import serializers
from .models import Return, ReturnItem


class ReturnItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnItem
        fields = ['id', 'return_request', 'product', 'sku', 'description',
                  'quantity', 'unit_price', 'condition', 'restock']
        read_only_fields = ['id']


class ReturnSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True)
    order_number = serializers.CharField(source='sales_order.order_number', read_only=True)
    customer_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = Return
        fields = ['id', 'rma_number', 'sales_order', 'order_number', 'customer', 'customer_name',
                  'reason', 'status', 'resolution', 'description', 'customer_comments',
                  'internal_notes', 'refund_amount', 'replacement_order',
                  'return_tracking_number', 'return_received_date',
                  'items', 'created_by', 'created_by_name', 'handled_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'rma_number', 'created_at', 'updated_at', 'created_by']

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.display_name
        return obj.sales_order.ship_to_name if obj.sales_order else ''

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        ret = Return.objects.create(**validated_data)
        for item_data in items_data:
            ReturnItem.objects.create(return_request=ret, **item_data)
        return ret
