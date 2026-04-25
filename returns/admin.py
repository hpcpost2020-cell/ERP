from django.contrib import admin
from .models import Return, ReturnItem


class ReturnItemInline(admin.TabularInline):
    model = ReturnItem
    extra = 0
    fields = ['product', 'sku', 'description', 'quantity', 'unit_price', 'condition', 'restock']


@admin.register(Return)
class ReturnAdmin(admin.ModelAdmin):
    list_display = ['rma_number', 'sales_order', 'customer', 'reason', 'status', 'resolution', 'refund_amount', 'created_at']
    list_filter = ['reason', 'status', 'resolution']
    search_fields = ['rma_number', 'sales_order__order_number', 'customer__company_name']
    readonly_fields = ['rma_number', 'created_at', 'updated_at']
    inlines = [ReturnItemInline]
