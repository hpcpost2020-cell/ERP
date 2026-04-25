from django.contrib import admin
from .models import PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem, SupplierCreditNote


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    fields = ['product', 'supplier_sku', 'qty_ordered', 'qty_received', 'unit_cost', 'landed_unit_cost', 'notes']
    readonly_fields = ['landed_unit_cost']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['po_number', 'supplier', 'status', 'order_date', 'expected_delivery_date', 'total_value', 'currency']
    list_filter = ['status', 'currency']
    search_fields = ['po_number', 'supplier__name', 'supplier_reference']
    readonly_fields = ['po_number', 'order_date', 'created_at', 'updated_at']
    inlines = [PurchaseOrderItemInline]
    fieldsets = (
        ('Order', {'fields': ('po_number', 'supplier', 'status', 'supplier_reference')}),
        ('Dates', {'fields': ('order_date', 'expected_delivery_date', 'actual_delivery_date')}),
        ('Financials', {'fields': ('currency', 'exchange_rate', 'payment_terms')}),
        ('Landed Costs', {'fields': ('freight_cost', 'import_duty', 'other_charges')}),
        ('Notes', {'fields': ('notes', 'internal_notes', 'delivery_address')}),
        ('Approvals', {'fields': ('created_by', 'approved_by', 'is_overdue', 'created_at', 'updated_at')}),
    )


class GoodsReceiptItemInline(admin.TabularInline):
    model = GoodsReceiptItem
    extra = 0
    fields = ['po_item', 'qty_received', 'qty_damaged', 'qc_status', 'qc_checked_by', 'qc_checked_at', 'qc_fail_reason', 'notes']
    readonly_fields = ['qc_checked_at']


@admin.register(GoodsReceipt)
class GoodsReceiptAdmin(admin.ModelAdmin):
    list_display = ['receipt_number', 'purchase_order', 'received_date', 'received_by', 'created_at']
    search_fields = ['receipt_number', 'purchase_order__po_number', 'delivery_note_ref']
    readonly_fields = ['receipt_number', 'created_at']
    inlines = [GoodsReceiptItemInline]


@admin.register(SupplierCreditNote)
class SupplierCreditNoteAdmin(admin.ModelAdmin):
    list_display = ['credit_note_number', 'supplier', 'amount', 'status', 'issued_date']
    list_filter = ['status']
    search_fields = ['credit_note_number', 'supplier__name']
    readonly_fields = ['created_at']
