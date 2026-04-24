from django.db import models
from django.conf import settings
from decimal import Decimal
import datetime


def generate_order_number():
    today = datetime.date.today()
    prefix = f"SO{today.strftime('%Y%m%d')}"
    last = SalesOrder.objects.filter(order_number__startswith=prefix).order_by('-order_number').first()
    if last:
        try:
            seq = int(last.order_number[-4:]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


class SalesOrder(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_PROCESSING = 'processing'
    STATUS_AWAITING_DISPATCH = 'awaiting_dispatch'
    STATUS_DISPATCHED = 'dispatched'
    STATUS_DELIVERED = 'delivered'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_ON_HOLD = 'on_hold'
    STATUS_REFUNDED = 'refunded'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_PROCESSING, 'Processing'),
        (STATUS_AWAITING_DISPATCH, 'Awaiting Dispatch'),
        (STATUS_DISPATCHED, 'Dispatched'),
        (STATUS_DELIVERED, 'Delivered'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_ON_HOLD, 'On Hold'),
        (STATUS_REFUNDED, 'Refunded'),
    ]

    PAYMENT_STATUS_UNPAID = 'unpaid'
    PAYMENT_STATUS_PARTIAL = 'partial'
    PAYMENT_STATUS_PAID = 'paid'
    PAYMENT_STATUS_REFUNDED = 'refunded'
    PAYMENT_STATUS_DISPUTED = 'disputed'

    PAYMENT_STATUS_CHOICES = [
        (PAYMENT_STATUS_UNPAID, 'Unpaid'),
        (PAYMENT_STATUS_PARTIAL, 'Partial'),
        (PAYMENT_STATUS_PAID, 'Paid'),
        (PAYMENT_STATUS_REFUNDED, 'Refunded'),
        (PAYMENT_STATUS_DISPUTED, 'Disputed'),
    ]

    CHANNEL_EBAY = 'ebay'
    CHANNEL_AMAZON = 'amazon'
    CHANNEL_WOOCOMMERCE = 'woocommerce'
    CHANNEL_DIRECT = 'direct'
    CHANNEL_PHONE = 'phone'
    CHANNEL_WHOLESALE = 'wholesale'

    CHANNEL_CHOICES = [
        (CHANNEL_EBAY, 'eBay'),
        (CHANNEL_AMAZON, 'Amazon'),
        (CHANNEL_WOOCOMMERCE, 'WooCommerce'),
        (CHANNEL_DIRECT, 'Direct / Website'),
        (CHANNEL_PHONE, 'Phone / Email'),
        (CHANNEL_WHOLESALE, 'Wholesale'),
    ]

    order_number = models.CharField(max_length=30, unique=True, db_index=True)
    external_order_id = models.CharField(max_length=100, blank=True, db_index=True)
    customer = models.ForeignKey('customers.Customer', null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_PENDING)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default=PAYMENT_STATUS_UNPAID)

    # Shipping address (stored denormalised so it doesn't change if customer updates)
    ship_to_name = models.CharField(max_length=255, blank=True)
    ship_to_company = models.CharField(max_length=255, blank=True)
    ship_to_address1 = models.CharField(max_length=255, blank=True)
    ship_to_address2 = models.CharField(max_length=255, blank=True)
    ship_to_city = models.CharField(max_length=100, blank=True)
    ship_to_county = models.CharField(max_length=100, blank=True)
    ship_to_postcode = models.CharField(max_length=20, blank=True)
    ship_to_country = models.CharField(max_length=100, default='United Kingdom')
    ship_to_phone = models.CharField(max_length=30, blank=True)
    ship_to_email = models.EmailField(blank=True)

    # Billing address
    bill_to_name = models.CharField(max_length=255, blank=True)
    bill_to_company = models.CharField(max_length=255, blank=True)
    bill_to_address1 = models.CharField(max_length=255, blank=True)
    bill_to_city = models.CharField(max_length=100, blank=True)
    bill_to_postcode = models.CharField(max_length=20, blank=True)
    bill_to_country = models.CharField(max_length=100, default='United Kingdom')

    # Financial
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    shipping_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    vat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    currency = models.CharField(max_length=3, default='GBP')

    # Dispatch
    requested_delivery_date = models.DateField(null=True, blank=True)
    dispatched_date = models.DateField(null=True, blank=True)

    # Marketplace specifics
    marketplace_fees = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    marketplace_order_id = models.CharField(max_length=100, blank=True)

    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_orders'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['channel']),
            models.Index(fields=['payment_status']),
            models.Index(fields=['created_at']),
            models.Index(fields=['customer']),
        ]

    def __str__(self):
        return f"{self.order_number} [{self.channel}] {self.status}"

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = generate_order_number()
        super().save(*args, **kwargs)

    def recalculate_totals(self):
        subtotal = sum(item.line_total for item in self.items.all())
        vat = sum(item.line_vat for item in self.items.all())
        self.subtotal = subtotal
        self.vat_amount = vat
        self.total_value = subtotal + vat + self.shipping_cost - self.discount_amount
        self.save(update_fields=['subtotal', 'vat_amount', 'total_value'])

    @property
    def estimated_cost(self):
        return sum(
            (item.product.buy_price * item.quantity) for item in self.items.all()
        )

    @property
    def estimated_margin(self):
        cost = self.estimated_cost
        if self.subtotal and cost:
            return self.subtotal - cost
        return Decimal('0.00')

    @property
    def estimated_margin_pct(self):
        cost = self.estimated_cost
        if self.subtotal and self.subtotal > 0 and cost:
            return round((self.subtotal - cost) / self.subtotal * 100, 2)
        return 0


class SalesOrderItem(models.Model):
    order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', null=True, blank=True, on_delete=models.SET_NULL, related_name='order_items')
    sku = models.CharField(max_length=100, blank=True)
    title = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('20.00'))
    buy_price_at_time = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.order.order_number}: {self.sku} x{self.quantity}"

    @property
    def discounted_price(self):
        return self.unit_price * (1 - self.discount_pct / 100)

    @property
    def line_total(self):
        return self.discounted_price * self.quantity

    @property
    def line_vat(self):
        return self.line_total * (self.vat_rate / 100)

    @property
    def line_total_inc_vat(self):
        return self.line_total + self.line_vat


class OrderNote(models.Model):
    TYPE_INTERNAL = 'internal'
    TYPE_CUSTOMER = 'customer'
    TYPE_SYSTEM = 'system'

    TYPE_CHOICES = [
        (TYPE_INTERNAL, 'Internal Note'),
        (TYPE_CUSTOMER, 'Customer Communication'),
        (TYPE_SYSTEM, 'System Event'),
    ]

    order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name='order_notes')
    note_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_INTERNAL)
    content = models.TextField()
    is_pinned = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Note on {self.order.order_number}: {self.content[:50]}"
