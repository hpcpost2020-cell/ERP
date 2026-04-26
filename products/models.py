from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from decimal import Decimal


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_DISCONTINUED = 'discontinued'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_DISCONTINUED, 'Discontinued'),
    ]

    sku = models.CharField(max_length=100, unique=True, db_index=True)
    barcode = models.CharField(max_length=100, blank=True, db_index=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name='products')
    brand = models.CharField(max_length=100, blank=True)
    unit_of_measure = models.CharField(max_length=30, default='each')
    buy_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    sell_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    rrp = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('20.00'))
    weight_kg = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    dimensions_cm = models.CharField(max_length=50, blank=True)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    reorder_quantity = models.PositiveIntegerField(default=10)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    image_url = models.URLField(blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_products'
    )
    purchase_uom = models.ForeignKey(
        'UnitOfMeasure', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='purchased_products',
        help_text='Unit used when ordering from supplier (e.g. Case, Pallet)'
    )
    sale_uom = models.ForeignKey(
        'UnitOfMeasure', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='sold_products',
        help_text='Unit used when selling to customers (e.g. Each)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sku']
        indexes = [
            models.Index(fields=['sku']),
            models.Index(fields=['barcode']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"[{self.sku}] {self.title}"

    @property
    def margin_pct(self):
        if self.sell_price and self.buy_price and self.sell_price > 0:
            return round((self.sell_price - self.buy_price) / self.sell_price * 100, 2)
        return 0

    @property
    def margin_value(self):
        return self.sell_price - self.buy_price


class ChannelListing(models.Model):
    CHANNEL_EBAY = 'ebay'
    CHANNEL_AMAZON = 'amazon'
    CHANNEL_WOOCOMMERCE = 'woocommerce'
    CHANNEL_DIRECT = 'direct'
    CHANNEL_WHOLESALE = 'wholesale'

    CHANNEL_CHOICES = [
        (CHANNEL_EBAY, 'eBay'),
        (CHANNEL_AMAZON, 'Amazon'),
        (CHANNEL_WOOCOMMERCE, 'WooCommerce'),
        (CHANNEL_DIRECT, 'Direct'),
        (CHANNEL_WHOLESALE, 'Wholesale'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='channel_listings')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    external_id = models.CharField(max_length=255, blank=True)
    external_sku = models.CharField(max_length=255, blank=True)
    # For WooCommerce product variations: external_id = variation ID, parent_id = parent product ID.
    # Empty for simple (non-variable) products.
    parent_id = models.CharField(max_length=255, blank=True, default='')
    channel_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    # is_active controls whether stock is pushed to this channel listing.
    # Auto-created listings start as False; user must confirm before stock syncs.
    is_active = models.BooleanField(default=False)
    last_synced = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['product', 'channel', 'external_id']

    def __str__(self):
        return f"{self.product.sku} on {self.channel} (ext:{self.external_id})"


class StockLocation(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_receiving_bay = models.BooleanField(
        default=False,
        help_text='Mark as the primary receiving/QC location for incoming goods'
    )

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name}"


class StockLevel(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_levels')
    location = models.ForeignKey(StockLocation, on_delete=models.CASCADE, related_name='stock_levels')
    qty_on_hand = models.IntegerField(default=0)
    qty_reserved = models.IntegerField(default=0)
    qty_damaged = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['product', 'location']
        indexes = [models.Index(fields=['product', 'location'])]

    def __str__(self):
        return f"{self.product.sku} @ {self.location.code}: {self.qty_available} available"

    @property
    def qty_available(self):
        return max(0, self.qty_on_hand - self.qty_reserved)

    @property
    def is_low_stock(self):
        return self.qty_available <= self.product.low_stock_threshold


class StockMovement(models.Model):
    TYPE_INWARD = 'inward'
    TYPE_OUTWARD = 'outward'
    TYPE_ADJUSTMENT = 'adjustment'
    TYPE_TRANSFER = 'transfer'
    TYPE_RETURN = 'return'
    TYPE_DAMAGE = 'damage'
    TYPE_WRITE_OFF = 'write_off'

    TYPE_CHOICES = [
        (TYPE_INWARD, 'Inward (Purchase)'),
        (TYPE_OUTWARD, 'Outward (Sale)'),
        (TYPE_ADJUSTMENT, 'Adjustment'),
        (TYPE_TRANSFER, 'Transfer'),
        (TYPE_RETURN, 'Return'),
        (TYPE_DAMAGE, 'Damage'),
        (TYPE_WRITE_OFF, 'Write-Off'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_movements')
    location = models.ForeignKey(StockLocation, on_delete=models.SET_NULL, null=True, related_name='stock_movements')
    movement_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    quantity = models.IntegerField()
    qty_before = models.IntegerField(default=0)
    qty_after = models.IntegerField(default=0)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.CharField(max_length=50, blank=True)
    reference_number = models.CharField(max_length=100, blank=True)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='stock_movements'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['product', 'created_at']),
            models.Index(fields=['reference_type', 'reference_id']),
        ]

    def __str__(self):
        return f"{self.movement_type} {self.quantity} x {self.product.sku} on {self.created_at.date()}"


class UnitOfMeasure(models.Model):
    """Defines units such as Each, Case, Pallet, Kg, Litre."""
    name = models.CharField(max_length=50, unique=True)
    abbreviation = models.CharField(max_length=10, unique=True)
    base_unit = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='derived_units',
        help_text='Leave blank if this is a base unit (e.g. Each)'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Unit of Measure'
        verbose_name_plural = 'Units of Measure'

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


class UoMConversion(models.Model):
    """
    Defines how many [to_uom] are in 1 [from_uom].
    e.g. 1 Pallet = 48 Cases  →  from=Pallet, to=Case, factor=48
    Product-specific conversions override global ones when product is set.
    """
    from_uom = models.ForeignKey(UnitOfMeasure, on_delete=models.CASCADE, related_name='conversions_from')
    to_uom = models.ForeignKey(UnitOfMeasure, on_delete=models.CASCADE, related_name='conversions_to')
    product = models.ForeignKey(
        Product, null=True, blank=True, on_delete=models.CASCADE,
        related_name='uom_conversions',
        help_text='Leave blank for a global conversion applicable to all products'
    )
    conversion_factor = models.DecimalField(
        max_digits=14, decimal_places=6,
        help_text='1 [from_uom] = [conversion_factor] [to_uom]'
    )

    class Meta:
        unique_together = ['from_uom', 'to_uom', 'product']

    def __str__(self):
        product_str = f" ({self.product.sku})" if self.product else " (global)"
        return f"1 {self.from_uom.abbreviation} = {self.conversion_factor} {self.to_uom.abbreviation}{product_str}"
