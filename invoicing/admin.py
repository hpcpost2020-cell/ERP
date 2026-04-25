from django.contrib import admin
from .models import Invoice, InvoiceItem, Payment


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    fields = ['description', 'sku', 'quantity', 'unit_price', 'discount_pct', 'vat_rate']


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    fields = ['amount', 'method', 'reference', 'payment_date', 'notes']
    readonly_fields = ['created_at']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'customer', 'status', 'issue_date', 'due_date', 'total_amount', 'amount_paid']
    list_filter = ['status', 'currency']
    search_fields = ['invoice_number', 'customer__company_name', 'bill_to_name']
    readonly_fields = ['invoice_number', 'created_at', 'updated_at']
    date_hierarchy = 'issue_date'
    inlines = [InvoiceItemInline, PaymentInline]
