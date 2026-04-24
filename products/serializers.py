from rest_framework import serializers
from .models import Category, Product, ChannelListing, StockLocation, StockLevel, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    children_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'parent', 'description', 'children_count', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_children_count(self, obj):
        return obj.children.count()


class CategoryNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class ChannelListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelListing
        fields = [
            'id', 'product', 'channel', 'external_id', 'external_sku',
            'channel_price', 'is_active', 'last_synced',
        ]
        read_only_fields = ['id']


class ChannelListingNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelListing
        fields = ['id', 'channel', 'external_id', 'channel_price', 'is_active', 'last_synced']
        read_only_fields = ['id']


class StockLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockLocation
        fields = ['id', 'code', 'name', 'description', 'is_active']
        read_only_fields = ['id']


class StockLevelSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    qty_available = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockLevel
        fields = [
            'id', 'product', 'product_sku', 'product_title',
            'location', 'location_code', 'location_name',
            'qty_on_hand', 'qty_reserved', 'qty_damaged',
            'qty_available', 'is_low_stock', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


class StockMovementSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_title = serializers.CharField(source='product.title', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'product', 'product_sku', 'product_title',
            'location', 'location_code',
            'movement_type', 'quantity', 'qty_before', 'qty_after',
            'reference_type', 'reference_id', 'reference_number',
            'unit_cost', 'notes', 'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = ['id', 'qty_before', 'qty_after', 'created_at', 'created_by']


class StockAdjustmentSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    location = serializers.PrimaryKeyRelatedField(queryset=StockLocation.objects.all())
    quantity = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    margin_pct = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    margin_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    stock_levels = StockLevelSerializer(many=True, read_only=True)
    channel_listings = ChannelListingNestedSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'barcode', 'title', 'description',
            'category', 'category_name', 'brand', 'unit_of_measure',
            'buy_price', 'sell_price', 'rrp', 'vat_rate',
            'weight_kg', 'dimensions_cm',
            'low_stock_threshold', 'reorder_quantity',
            'status', 'image_url', 'notes',
            'margin_pct', 'margin_value',
            'stock_levels', 'channel_listings',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def validate_sku(self, value):
        return value.strip().upper()


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views - no nested data."""
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    margin_pct = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'barcode', 'title', 'brand',
            'category', 'category_name',
            'buy_price', 'sell_price', 'vat_rate',
            'status', 'image_url', 'margin_pct',
            'low_stock_threshold', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
