from django.db import models
from django.conf import settings
from decimal import Decimal


class Supplier(models.Model):
    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_ON_HOLD = 'on_hold'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_ON_HOLD, 'On Hold'),
    ]

    PAYMENT_TERMS_CHOICES = [
        ('immediate', 'Immediate / Proforma'),
        ('net7', 'Net 7 Days'),
        ('net14', 'Net 14 Days'),
        ('net30', 'Net 30 Days'),
        ('net60', 'Net 60 Days'),
        ('net90', 'Net 90 Days'),
        ('eom', 'End of Month'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    contact_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    county = models.CharField(max_length=100, blank=True)
    postcode = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, default='United Kingdom')
    payment_terms = models.CharField(max_length=20, choices=PAYMENT_TERMS_CHOICES, default='net30')
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default='GBP')
    lead_time_days = models.PositiveIntegerField(default=3)
    minimum_order_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    account_number = models.CharField(max_length=100, blank=True)
    vat_number = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_suppliers'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class SupplierProduct(models.Model):
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='supplier_products')
    product = models.ForeignKey('products.Product', on_delete=models.CASCADE, related_name='supplier_products')
    supplier_sku = models.CharField(max_length=100, blank=True)
    supplier_description = models.CharField(max_length=255, blank=True)
    buy_price = models.DecimalField(max_digits=12, decimal_places=2)
    pack_size = models.PositiveIntegerField(default=1)
    lead_time_days = models.PositiveIntegerField(null=True, blank=True)
    is_preferred = models.BooleanField(default=False)
    last_ordered_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['supplier', 'product']
        ordering = ['supplier', 'product']

    def __str__(self):
        return f"{self.supplier.name} → {self.product.sku} @ £{self.buy_price}"


class SupplierPriceHistory(models.Model):
    supplier_product = models.ForeignKey(SupplierProduct, on_delete=models.CASCADE, related_name='price_history')
    buy_price = models.DecimalField(max_digits=12, decimal_places=2)
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-recorded_at']

    def __str__(self):
        return f"{self.supplier_product} @ £{self.buy_price} on {self.recorded_at.date()}"


class SupplierIssue(models.Model):
    ISSUE_SHORTAGE = 'shortage'
    ISSUE_DAMAGE = 'damage'
    ISSUE_LATE = 'late_delivery'
    ISSUE_WRONG_ITEM = 'wrong_item'
    ISSUE_INVOICE = 'invoice_dispute'
    ISSUE_OTHER = 'other'

    ISSUE_CHOICES = [
        (ISSUE_SHORTAGE, 'Shortage'),
        (ISSUE_DAMAGE, 'Damage / Quality'),
        (ISSUE_LATE, 'Late Delivery'),
        (ISSUE_WRONG_ITEM, 'Wrong Item'),
        (ISSUE_INVOICE, 'Invoice Dispute'),
        (ISSUE_OTHER, 'Other'),
    ]

    STATUS_OPEN = 'open'
    STATUS_IN_PROGRESS = 'in_progress'
    STATUS_RESOLVED = 'resolved'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_IN_PROGRESS, 'In Progress'),
        (STATUS_RESOLVED, 'Resolved'),
    ]

    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE, related_name='issues')
    issue_type = models.CharField(max_length=30, choices=ISSUE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    title = models.CharField(max_length=255)
    description = models.TextField()
    purchase_order_ref = models.CharField(max_length=50, blank=True)
    resolution = models.TextField(blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='reported_supplier_issues'
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='resolved_supplier_issues'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.supplier.name}: {self.title}"
