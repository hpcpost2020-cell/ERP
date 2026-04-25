from django.contrib import admin
from .models import WarehouseZone, WarehouseLocation, PickingBatch, PickingBatchItem, StockLocationAssignment


@admin.register(WarehouseZone)
class WarehouseZoneAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'zone_type', 'is_active', 'created_at']
    list_filter = ['zone_type', 'is_active']
    search_fields = ['name', 'code']


class WarehouseLocationInline(admin.TabularInline):
    model = WarehouseLocation
    extra = 0
    fields = ['aisle', 'rack', 'shelf', 'bin', 'barcode', 'location_type', 'is_active']
    readonly_fields = ['barcode']


@admin.register(WarehouseLocation)
class WarehouseLocationAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'zone', 'location_type', 'barcode', 'is_active']
    list_filter = ['zone', 'location_type', 'is_active']
    search_fields = ['barcode', 'aisle', 'rack', 'shelf', 'bin']
    readonly_fields = ['barcode', 'created_at']


class PickingBatchItemInline(admin.TabularInline):
    model = PickingBatchItem
    extra = 0
    fields = ['product', 'location', 'qty_required', 'qty_picked', 'status', 'picked_by']
    readonly_fields = ['picked_at']


@admin.register(PickingBatch)
class PickingBatchAdmin(admin.ModelAdmin):
    list_display = ['batch_number', 'status', 'assigned_to', 'created_by', 'created_at']
    list_filter = ['status']
    search_fields = ['batch_number']
    readonly_fields = ['batch_number', 'created_at', 'started_at', 'completed_at']
    inlines = [PickingBatchItemInline]


@admin.register(StockLocationAssignment)
class StockLocationAssignmentAdmin(admin.ModelAdmin):
    list_display = ['product', 'location', 'is_primary', 'qty_on_hand', 'qty_reserved', 'qty_available']
    list_filter = ['is_primary', 'location__zone']
    search_fields = ['product__sku', 'product__title', 'location__barcode']
    readonly_fields = ['updated_at']
