from django.contrib import admin
from .models import SalesOrder, SalesOrderItem, OrderNote


class SalesOrderItemInline(admin.TabularInline):
    model = SalesOrderItem
    extra = 0
    fields = ['product', 'sku', 'title', 'quantity', 'unit_price', 'discount_pct', 'vat_rate']


class OrderNoteInline(admin.TabularInline):
    model = OrderNote
    extra = 0
    fields = ['note_type', 'content', 'is_pinned', 'created_by', 'created_at']
    readonly_fields = ['created_at']


@admin.register(SalesOrder)
class SalesOrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'customer', 'channel', 'status', 'payment_status', 'total_value', 'created_at']
    list_filter = ['status', 'payment_status', 'channel']
    search_fields = ['order_number', 'external_order_id', 'customer__company_name', 'ship_to_name']
    readonly_fields = ['order_number', 'created_at', 'updated_at']
    date_hierarchy = 'created_at'
    inlines = [SalesOrderItemInline, OrderNoteInline]
