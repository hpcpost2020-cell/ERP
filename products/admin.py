from django.contrib import admin
from .models import Category, Product, ChannelListing, StockLocation, StockLevel, StockMovement, UnitOfMeasure, UoMConversion


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'parent', 'created_at']
    search_fields = ['name']


class ChannelListingInline(admin.TabularInline):
    model = ChannelListing
    extra = 0
    fields = ['channel', 'external_id', 'external_sku', 'channel_price', 'is_active', 'last_synced']
    readonly_fields = ['last_synced']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['sku', 'title', 'status', 'buy_price', 'sell_price', 'vat_rate', 'created_at']
    list_filter = ['status', 'category', 'brand']
    search_fields = ['sku', 'barcode', 'title', 'brand']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [ChannelListingInline]
    fieldsets = (
        ('Identity', {'fields': ('sku', 'barcode', 'title', 'description', 'category', 'brand', 'status')}),
        ('Pricing', {'fields': ('buy_price', 'sell_price', 'rrp', 'vat_rate')}),
        ('Units', {'fields': ('unit_of_measure', 'purchase_uom', 'sale_uom')}),
        ('Physical', {'fields': ('weight_kg', 'dimensions_cm')}),
        ('Stock', {'fields': ('low_stock_threshold', 'reorder_quantity')}),
        ('Other', {'fields': ('image_url', 'notes', 'created_by', 'created_at', 'updated_at')}),
    )


@admin.register(StockLocation)
class StockLocationAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'is_active']
    search_fields = ['code', 'name']
    list_filter = ['is_active']


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = ['product', 'location', 'qty_on_hand', 'qty_reserved', 'qty_available', 'qty_damaged', 'updated_at']
    list_filter = ['location']
    search_fields = ['product__sku', 'product__title']
    readonly_fields = ['updated_at']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ['product', 'movement_type', 'quantity', 'location', 'reference_number', 'created_by', 'created_at']
    list_filter = ['movement_type', 'location']
    search_fields = ['product__sku', 'reference_number']
    readonly_fields = ['created_at']
    date_hierarchy = 'created_at'


@admin.register(UnitOfMeasure)
class UnitOfMeasureAdmin(admin.ModelAdmin):
    list_display = ['name', 'abbreviation', 'base_unit', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'abbreviation']


@admin.register(UoMConversion)
class UoMConversionAdmin(admin.ModelAdmin):
    list_display = ['from_uom', 'to_uom', 'conversion_factor', 'product']
    list_filter = ['from_uom', 'to_uom']
    search_fields = ['product__sku']
