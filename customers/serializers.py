from rest_framework import serializers
from .models import Customer, CustomerAddress, CustomerNote


class CustomerAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAddress
        fields = ['id', 'customer', 'address_type', 'is_default',
                  'address_line1', 'address_line2', 'city', 'county', 'postcode', 'country']
        read_only_fields = ['id']


class CustomerNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = CustomerNote
        fields = ['id', 'customer', 'content', 'is_important', 'created_by', 'created_by_name', 'created_at']
        read_only_fields = ['id', 'created_at', 'created_by']


class CustomerListSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    total_orders = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ['id', 'customer_number', 'display_name', 'company_name',
                  'first_name', 'last_name', 'email', 'phone',
                  'customer_type', 'status', 'total_orders', 'created_at']

    def get_total_orders(self, obj):
        return obj.orders.count()


class CustomerSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    addresses = CustomerAddressSerializer(many=True, read_only=True)
    customer_notes = CustomerNoteSerializer(many=True, read_only=True)
    total_spend = serializers.SerializerMethodField()
    total_orders = serializers.SerializerMethodField()
    avg_order_value = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ['id', 'customer_number', 'display_name', 'company_name',
                  'first_name', 'last_name', 'email', 'phone', 'mobile',
                  'customer_type', 'status', 'payment_terms', 'credit_limit',
                  'tax_exempt', 'vat_number', 'notes', 'source',
                  'addresses', 'customer_notes',
                  'total_spend', 'total_orders', 'avg_order_value',
                  'created_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'customer_number', 'created_at', 'updated_at', 'created_by']

    def get_total_spend(self, obj):
        from django.db.models import Sum
        result = obj.orders.aggregate(total=Sum('total_value'))
        return result['total'] or 0

    def get_total_orders(self, obj):
        return obj.orders.count()

    def get_avg_order_value(self, obj):
        from django.db.models import Avg
        result = obj.orders.aggregate(avg=Avg('total_value'))
        val = result['avg'] or 0
        return round(float(val), 2)
