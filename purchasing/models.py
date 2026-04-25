from django.db import models
from django.conf import settings
from decimal import Decimal
import datetime


def generate_po_number():
    today = datetime.date.today()
    prefix = f"PO{today.strftime('%Y%m')}"
    last = PurchaseOrder.objects.filter(po_number__startswith=prefix).order_by('-po_number').first()
    if last:
        try:
            seq = int(last.po_number[-4:]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


class PurchaseOrder(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_SENT = 'sent'
    STATUS_ACKNOWLEDGED = 'acknowledged'
    STATUS_PART_RECEIVED = 'part_received'
    STATUS_RECEIVED = 'received'
    STATUS_CLOSED = 'closed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_SENT, 'Sent to Supplier'),
        (STATUS_ACKNOWLEDGED, 'Acknowledged'),
        (STATUS_PART_RECEIVED, 'Part Received'),
        (STATUS_RECEIVED, 'Fully Received'),
        (STATUS_CLOSED, 'Closed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    po_number = models.CharField(max_length=30, unique=True, db_index=True)
    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT, related_name='purchase_orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    order_date = models.DateField(auto_now_add=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    actual_delivery_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=20, blank=True)
    currency = models.CharField(max_length=3, default='GBP')
    exchange_rate = models.DecimalField(
        max_digits=10, decimal_places=6, default=Decimal('1.000000'),
        help_text='Exchange rate to GBP at time of order'
    )
    # Landed cost components (added on top of product unit costs)
    freight_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    import_duty = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    other_charges = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    delivery_address = models.TextField(blank=True)
    supplier_reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    is_overdue = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_purchase_orders'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='approved_purchase_orders'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['supplier', 'status']),
            models.Index(fields=['expected_delivery_date']),
        ]

    def __str__(self):
        return f"{self.po_number} - {self.supplier.name} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.po_number:
            self.po_number = generate_po_number()
        if self.payment_terms == '' and self.supplier_id:
            self.payment_terms = self.supplier.payment_terms
        super().save(*args, **kwargs)

    @property
    def total_value(self):
        return sum(
            (item.qty_ordered * item.unit_cost) for item in self.items.all()
        )

    @property
    def total_received_value(self):
        return sum(
            (item.qty_received * item.unit_cost) for item in self.items.all()
        )

    @property
    def is_fully_received(self):
        return all(item.qty_received >= item.qty_ordered for item in self.items.all())

    @property
    def total_additional_charges(self):
        return self.freight_cost + self.import_duty + self.other_charges

    @property
    def total_landed_cost(self):
        """Total value including exchange rate conversion and all additional charges."""
        goods_value = self.total_value * self.exchange_rate
        return goods_value + self.total_additional_charges

    @property
    def landed_cost_per_unit_overhead(self):
        """Additional charges spread per unit ordered (for landed cost calculation)."""
        total_units = sum(item.qty_ordered for item in self.items.all())
        if total_units > 0:
            return self.total_additional_charges / total_units
        return Decimal('0.00')


class PurchaseOrderItem(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', on_delete=models.PROTECT, related_name='po_items')
    supplier_sku = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=255, blank=True)
    qty_ordered = models.PositiveIntegerField()
    qty_received = models.IntegerField(default=0)
    qty_damaged = models.IntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    landed_unit_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text='Calculated on receipt: unit_cost + prorated freight/duty/charges'
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.purchase_order.po_number}: {self.product.sku} x{self.qty_ordered}"

    @property
    def qty_outstanding(self):
        return max(0, self.qty_ordered - self.qty_received)

    @property
    def line_total(self):
        return self.qty_ordered * self.unit_cost

    @property
    def received_total(self):
        return self.qty_received * self.unit_cost


class GoodsReceipt(models.Model):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='goods_receipts')
    receipt_number = models.CharField(max_length=30, unique=True)
    received_date = models.DateField()
    delivery_note_ref = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='goods_receipts'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"GR{self.receipt_number} for {self.purchase_order.po_number}"

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            import datetime
            today = datetime.date.today()
            prefix = f"GR{today.strftime('%Y%m')}"
            last = GoodsReceipt.objects.filter(receipt_number__startswith=prefix).order_by('-receipt_number').first()
            seq = (int(last.receipt_number[-4:]) + 1) if last else 1
            self.receipt_number = f"{prefix}{seq:04d}"
        super().save(*args, **kwargs)


class GoodsReceiptItem(models.Model):
    QC_PENDING = 'pending'
    QC_PASSED = 'passed'
    QC_FAILED = 'failed'
    QC_QUARANTINED = 'quarantined'

    QC_CHOICES = [
        (QC_PENDING, 'Pending QC'),
        (QC_PASSED, 'Passed QC'),
        (QC_FAILED, 'Failed QC'),
        (QC_QUARANTINED, 'Quarantined'),
    ]

    goods_receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name='items')
    po_item = models.ForeignKey(PurchaseOrderItem, on_delete=models.CASCADE, related_name='receipt_items')
    qty_received = models.PositiveIntegerField()
    qty_damaged = models.PositiveIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)
    # QC workflow fields
    qc_status = models.CharField(max_length=20, choices=QC_CHOICES, default=QC_PENDING)
    qc_checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='qc_checked_items'
    )
    qc_checked_at = models.DateTimeField(null=True, blank=True)
    qc_notes = models.TextField(blank=True)
    qc_fail_reason = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.goods_receipt}: {self.po_item.product.sku} x{self.qty_received}"

    @property
    def is_available_for_stock(self):
        """Stock is only counted as available once QC has passed."""
        return self.qc_status == self.QC_PASSED


class SupplierCreditNote(models.Model):
    STATUS_OPEN = 'open'
    STATUS_APPLIED = 'applied'
    STATUS_EXPIRED = 'expired'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_APPLIED, 'Applied'),
        (STATUS_EXPIRED, 'Expired'),
    ]

    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT, related_name='credit_notes')
    purchase_order = models.ForeignKey(PurchaseOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name='credit_notes')
    credit_note_number = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    issued_date = models.DateField()
    expiry_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"SCN {self.credit_note_number} - {self.supplier.name} £{self.amount}"
