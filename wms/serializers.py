from rest_framework import serializers
from .models import WarehouseZone, WarehouseLocation, PickingBatch, PickingBatchItem, StockLocationAssignment


class WarehouseZoneSerializer(serializers.ModelSerializer):
    locations_count = serializers.SerializerMethodField()

    class Meta:
        model = WarehouseZone
        fields = ['id', 'name', 'code', 'zone_type', 'description', 'is_active', 'locations_count', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_locations_count(self, obj):
        return obj.locations.filter(is_active=True).count()


class WarehouseLocationSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    zone_code = serializers.CharField(source='zone.code', read_only=True)
    zone_type = serializers.CharField(source='zone.zone_type', read_only=True)
    display = serializers.SerializerMethodField()
    stock_count = serializers.SerializerMethodField()

    class Meta:
        model = WarehouseLocation
        fields = [
            'id', 'zone', 'zone_name', 'zone_code', 'zone_type',
            'aisle', 'rack', 'shelf', 'bin', 'barcode',
            'location_type', 'is_active', 'max_weight_kg', 'notes',
            'display', 'stock_count', 'created_at',
        ]
        read_only_fields = ['id', 'barcode', 'created_at']

    def get_display(self, obj):
        return str(obj)

    def get_stock_count(self, obj):
        return obj.product_assignments.count()


class WarehouseLocationMinimalSerializer(serializers.ModelSerializer):
    display = serializers.SerializerMethodField()

    class Meta:
        model = WarehouseLocation
        fields = ['id', 'barcode', 'display', 'zone', 'aisle', 'rack', 'shelf', 'bin']

    def get_display(self, obj):
        return str(obj)


class StockLocationAssignmentSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    location_barcode = serializers.CharField(source='location.barcode', read_only=True)
    location_display = serializers.SerializerMethodField()
    qty_available = serializers.IntegerField(read_only=True)

    class Meta:
        model = StockLocationAssignment
        fields = [
            'id', 'product', 'product_sku', 'product_title', 'product_barcode',
            'location', 'location_barcode', 'location_display',
            'is_primary', 'qty_on_hand', 'qty_reserved', 'qty_available',
            'last_counted_at', 'last_counted_by', 'updated_at',
        ]
        read_only_fields = ['id', 'qty_available', 'updated_at']

    def get_location_display(self, obj):
        return str(obj.location)


class PickingBatchItemSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)
    product_barcode = serializers.CharField(source='product.barcode', read_only=True)
    order_number = serializers.CharField(source='sales_order.order_number', read_only=True)
    location_barcode = serializers.CharField(source='location.barcode', read_only=True, allow_null=True)
    location_display = serializers.SerializerMethodField()
    picked_by_name = serializers.CharField(source='picked_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = PickingBatchItem
        fields = [
            'id', 'batch', 'sales_order', 'order_number', 'order_item',
            'product', 'product_sku', 'product_title', 'product_barcode',
            'location', 'location_barcode', 'location_display',
            'qty_required', 'qty_picked', 'status',
            'picked_by', 'picked_by_name', 'picked_at', 'notes',
        ]
        read_only_fields = ['id', 'batch', 'picked_at']

    def get_location_display(self, obj):
        return str(obj.location) if obj.location else None


class PickingBatchSerializer(serializers.ModelSerializer):
    items = PickingBatchItemSerializer(many=True, read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, allow_null=True)
    items_count = serializers.SerializerMethodField()
    items_picked = serializers.SerializerMethodField()
    progress_pct = serializers.SerializerMethodField()

    class Meta:
        model = PickingBatch
        fields = [
            'id', 'batch_number', 'status',
            'assigned_to', 'assigned_to_name',
            'created_by', 'created_by_name',
            'notes', 'items_count', 'items_picked', 'progress_pct',
            'created_at', 'started_at', 'completed_at',
            'items',
        ]
        read_only_fields = ['id', 'batch_number', 'created_at', 'started_at', 'completed_at', 'created_by']

    def get_items_count(self, obj):
        return obj.items.count()

    def get_items_picked(self, obj):
        return obj.items.filter(status=PickingBatchItem.STATUS_PICKED).count()

    def get_progress_pct(self, obj):
        total = obj.items.count()
        if total == 0:
            return 0
        picked = obj.items.filter(status=PickingBatchItem.STATUS_PICKED).count()
        return round(picked / total * 100, 1)


class PickingBatchListSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True, allow_null=True)
    items_count = serializers.SerializerMethodField()
    progress_pct = serializers.SerializerMethodField()

    class Meta:
        model = PickingBatch
        fields = [
            'id', 'batch_number', 'status', 'assigned_to', 'assigned_to_name',
            'items_count', 'progress_pct', 'created_at',
        ]
        read_only_fields = ['id', 'batch_number', 'created_at']

    def get_items_count(self, obj):
        return obj.items.count()

    def get_progress_pct(self, obj):
        total = obj.items.count()
        if total == 0:
            return 0
        picked = obj.items.filter(status=PickingBatchItem.STATUS_PICKED).count()
        return round(picked / total * 100, 1)


class StockTransferSerializer(serializers.Serializer):
    product = serializers.IntegerField(help_text='Product ID')
    from_location = serializers.IntegerField(help_text='Source WarehouseLocation ID')
    to_location = serializers.IntegerField(help_text='Destination WarehouseLocation ID')
    quantity = serializers.IntegerField(min_value=1)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class CycleCountSerializer(serializers.Serializer):
    counted_qty = serializers.IntegerField(min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
