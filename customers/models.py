from django.db import models
from django.conf import settings
from decimal import Decimal


class Customer(models.Model):
    TYPE_RETAIL = 'retail'
    TYPE_WHOLESALE = 'wholesale'
    TYPE_MARKETPLACE = 'marketplace'

    TYPE_CHOICES = [
        (TYPE_RETAIL, 'Retail'),
        (TYPE_WHOLESALE, 'Wholesale'),
        (TYPE_MARKETPLACE, 'Marketplace'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_INACTIVE = 'inactive'
    STATUS_ON_HOLD = 'on_hold'
    STATUS_BLACKLISTED = 'blacklisted'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_INACTIVE, 'Inactive'),
        (STATUS_ON_HOLD, 'On Hold'),
        (STATUS_BLACKLISTED, 'Blacklisted'),
    ]

    PAYMENT_TERMS_CHOICES = [
        ('prepay', 'Prepayment'),
        ('net7', 'Net 7 Days'),
        ('net14', 'Net 14 Days'),
        ('net30', 'Net 30 Days'),
        ('net60', 'Net 60 Days'),
        ('eom', 'End of Month'),
        ('other', 'Other'),
    ]

    customer_number = models.CharField(max_length=20, unique=True)
    company_name = models.CharField(max_length=255, blank=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=30, blank=True)
    mobile = models.CharField(max_length=30, blank=True)
    customer_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_RETAIL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    payment_terms = models.CharField(max_length=20, choices=PAYMENT_TERMS_CHOICES, default='prepay')
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tax_exempt = models.BooleanField(default=False)
    vat_number = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    source = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_customers'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['company_name', 'last_name', 'first_name']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['customer_number']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        if self.company_name:
            return f"[{self.customer_number}] {self.company_name}"
        return f"[{self.customer_number}] {self.first_name} {self.last_name}".strip()

    @property
    def display_name(self):
        if self.company_name:
            return self.company_name
        return f"{self.first_name} {self.last_name}".strip() or self.email


class CustomerAddress(models.Model):
    TYPE_BILLING = 'billing'
    TYPE_SHIPPING = 'shipping'
    TYPE_BOTH = 'both'

    TYPE_CHOICES = [
        (TYPE_BILLING, 'Billing'),
        (TYPE_SHIPPING, 'Shipping'),
        (TYPE_BOTH, 'Billing & Shipping'),
    ]

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='addresses')
    address_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default=TYPE_BOTH)
    is_default = models.BooleanField(default=False)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    county = models.CharField(max_length=100, blank=True)
    postcode = models.CharField(max_length=20)
    country = models.CharField(max_length=100, default='United Kingdom')

    class Meta:
        ordering = ['-is_default', 'address_type']

    def __str__(self):
        return f"{self.customer}: {self.address_line1}, {self.city} {self.postcode}"


class CustomerNote(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='customer_notes')
    content = models.TextField()
    is_important = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Note for {self.customer} on {self.created_at.date()}"
