from django.contrib import admin
from .models import Supplier, SupplierProduct, SupplierPriceHistory, SupplierIssue


class SupplierProductInline(admin.TabularInline):
    model = SupplierProduct
    extra = 0
    fields = ['product', 'supplier_sku', 'buy_price', 'pack_size', 'lead_time_days', 'is_preferred']


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'contact_name', 'email', 'status', 'currency', 'lead_time_days']
    list_filter = ['status', 'currency']
    search_fields = ['code', 'name', 'contact_name', 'email']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [SupplierProductInline]


@admin.register(SupplierIssue)
class SupplierIssueAdmin(admin.ModelAdmin):
    list_display = ['supplier', 'issue_type', 'status', 'title', 'created_at']
    list_filter = ['issue_type', 'status']
    search_fields = ['supplier__name', 'title']
    readonly_fields = ['created_at', 'resolved_at']
