from django.db import models
from django.conf import settings
import datetime


class WarehouseZone(models.Model):
    ZONE_PICKING = 'picking'
    ZONE_BULK = 'bulk'
    ZONE_RECEIVING = 'receiving'
    ZONE_DISPATCH = 'dispatch'
    ZONE_QUARANTINE = 'quarantine'
    ZONE_RETURNS = 'returns'

    ZONE_TYPES = [
        (ZONE_PICKING, 'Picking'),
        (ZONE_BULK, 'Bulk Storage'),
        (ZONE_RECEIVING, 'Receiving'),
        (ZONE_DISPATCH, 'Dispatch'),
        (ZONE_QUARANTINE, 'Quarantine'),
        (ZONE_RETURNS, 'Returns'),
    ]

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=10, unique=True)
    zone_type = models.CharField(max_length=20, choices=ZONE_TYPES)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_zone_type_display()})"


class WarehouseLocation(models.Model):
    TYPE_STANDARD = 'standard'
    TYPE_BULK = 'bulk'
    TYPE_QUARANTINE = 'quarantine'
    TYPE_RECEIVING = 'receiving'
    TYPE_DISPATCH = 'dispatch'

    LOCATION_TYPES = [
        (TYPE_STANDARD, 'Standard'),
        (TYPE_BULK, 'Bulk'),
        (TYPE_QUARANTINE, 'Quarantine'),
        (TYPE_RECEIVING, 'Receiving'),
        (TYPE_DISPATCH, 'Dispatch'),
    ]

    zone = models.ForeignKey(WarehouseZone, on_delete=models.PROTECT, related_name='locations')
    aisle = models.CharField(max_length=10)
    rack = models.CharField(max_length=10)
    shelf = models.CharField(max_length=10)
    bin = models.CharField(max_length=10, blank=True)
    barcode = models.CharField(max_length=50, unique=True, blank=True, db_index=True)
    location_type = models.CharField(max_length=20, choices=LOCATION_TYPES, default=TYPE_STANDARD)
    is_active = models.BooleanField(default=True)
    max_weight_kg = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['zone', 'aisle', 'rack', 'shelf', 'bin']
        unique_together = ['zone', 'aisle', 'rack', 'shelf', 'bin']

    def __str__(self):
        parts = [self.zone.code, self.aisle, self.rack, self.shelf]
        if self.bin:
            parts.append(self.bin)
        return '-'.join(parts)

    def save(self, *args, **kwargs):
        if not self.barcode:
            parts = [self.zone.code, self.aisle, self.rack, self.shelf]
            if self.bin:
                parts.append(self.bin)
            self.barcode = '-'.join(parts)
        super().save(*args, **kwargs)


class PickingBatch(models.Model):
    STATUS_OPEN = 'open'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    batch_number = models.CharField(max_length=30, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='picking_batches'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_batches'
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Picking Batches'

    def __str__(self):
        return f"Batch {self.batch_number} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.batch_number:
            today = datetime.date.today()
            prefix = f"BATCH{today.strftime('%Y%m%d')}"
            last = PickingBatch.objects.filter(batch_number__startswith=prefix).order_by('-batch_number').first()
            seq = (int(last.batch_number[-4:]) + 1) if last else 1
            self.batch_number = f"{prefix}{seq:04d}"
        super().save(*args, **kwargs)


class PickingBatchItem(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_PICKED = 'picked'
    STATUS_SHORT = 'short'
    STATUS_SKIPPED = 'skipped'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PICKED, 'Picked'),
        (STATUS_SHORT, 'Short Pick'),
        (STATUS_SKIPPED, 'Skipped'),
    ]

    batch = models.ForeignKey(PickingBatch, on_delete=models.CASCADE, related_name='items')
    sales_order = models.ForeignKey('sales.SalesOrder', on_delete=models.CASCADE, related_name='batch_items')
    order_item = models.ForeignKey('sales.SalesOrderItem', on_delete=models.CASCADE, related_name='batch_items')
    product = models.ForeignKey('products.Product', on_delete=models.PROTECT, related_name='batch_items')
    location = models.ForeignKey(
        WarehouseLocation, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='batch_items'
    )
    qty_required = models.PositiveIntegerField()
    qty_picked = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    picked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='picked_items'
    )
    picked_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['location__aisle', 'location__rack', 'location__shelf']

    def __str__(self):
        return f"{self.batch.batch_number}: {self.product.sku} x{self.qty_required}"


class StockLocationAssignment(models.Model):
    """Links a Product to a preferred WarehouseLocation for put-away and picking."""
    product = models.ForeignKey('products.Product', on_delete=models.CASCADE, related_name='location_assignments')
    location = models.ForeignKey(WarehouseLocation, on_delete=models.CASCADE, related_name='product_assignments')
    is_primary = models.BooleanField(default=True)
    qty_on_hand = models.IntegerField(default=0)
    qty_reserved = models.IntegerField(default=0)
    last_counted_at = models.DateTimeField(null=True, blank=True)
    last_counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='stock_counts'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['product', 'location']
        ordering = ['location']

    def __str__(self):
        return f"{self.product.sku} @ {self.location}"

    @property
    def qty_available(self):
        return max(0, self.qty_on_hand - self.qty_reserved)
