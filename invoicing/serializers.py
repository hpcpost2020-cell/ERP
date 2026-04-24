from rest_framework import serializers
from .models import Invoice, InvoiceItem, Payment


class InvoiceItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_vat = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = InvoiceItem
        fields = ['id', 'invoice', 'description', 'sku', 'quantity',
                  'unit_price', 'discount_pct', 'vat_rate', 'line_total', 'line_vat']
        read_only_fields = ['id']


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)

    class Meta:
        model = Payment
        fields = ['id', 'invoice', 'amount', 'method', 'reference',
                  'payment_date', 'notes', 'recorded_by', 'recorded_by_name', 'created_at']
        read_only_fields = ['id', 'created_at', 'recorded_by']


class InvoiceListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = ['id', 'invoice_number', 'customer', 'customer_name', 'status',
                  'issue_date', 'due_date', 'total_amount', 'amount_paid', 'balance_due',
                  'currency', 'created_at']

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.display_name
        return obj.bill_to_name or ''


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)
    payments = PaymentSerializer(many=True, read_only=True)
    customer_name = serializers.SerializerMethodField()
    balance_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = ['id', 'invoice_number', 'sales_order', 'customer', 'customer_name',
                  'status', 'issue_date', 'due_date', 'payment_terms',
                  'subtotal', 'discount_amount', 'vat_amount', 'total_amount',
                  'amount_paid', 'balance_due', 'currency',
                  'bill_to_name', 'bill_to_company', 'bill_to_address',
                  'notes', 'internal_notes', 'is_overdue',
                  'items', 'payments',
                  'created_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'invoice_number', 'created_at', 'updated_at', 'created_by']

    def get_customer_name(self, obj):
        if obj.customer:
            return obj.customer.display_name
        return obj.bill_to_name or ''

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        invoice = Invoice.objects.create(**validated_data)
        subtotal = 0
        vat_total = 0
        for item_data in items_data:
            item = InvoiceItem.objects.create(invoice=invoice, **item_data)
            subtotal += float(item.line_total)
            vat_total += float(item.line_vat)
        invoice.subtotal = subtotal
        invoice.vat_amount = vat_total
        invoice.total_amount = subtotal + vat_total - float(invoice.discount_amount)
        invoice.save()
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            subtotal = 0
            vat_total = 0
            for item_data in items_data:
                item = InvoiceItem.objects.create(invoice=instance, **item_data)
                subtotal += float(item.line_total)
                vat_total += float(item.line_vat)
            instance.subtotal = subtotal
            instance.vat_amount = vat_total
            instance.total_amount = subtotal + vat_total - float(instance.discount_amount)
            instance.save()
        return instance
