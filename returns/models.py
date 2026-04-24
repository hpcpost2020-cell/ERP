from django.db import models
from django.conf import settings
from decimal import Decimal


class Return(models.Model):
    REASON_NOT_AS_DESCRIBED = 'not_as_described'
    REASON_DAMAGED = 'damaged'
    REASON_WRONG_ITEM = 'wrong_item'
    REASON_CHANGED_MIND = 'changed_mind'
    REASON_FAULTY = 'faulty'
    REASON_NOT_RECEIVED = 'not_received'
    REASON_DUPLICATE = 'duplicate_order'
    REASON_OTHER = 'other'

    REASON_CHOICES = [
        (REASON_NOT_AS_DESCRIBED, 'Not as Described'),
        (REASON_DAMAGED, 'Damaged on Arrival'),
        (REASON_WRONG_ITEM, 'Wrong Item Sent'),
        (REASON_CHANGED_MIND, 'Changed Mind'),
        (REASON_FAULTY, 'Faulty / Defective'),
        (REASON_NOT_RECEIVED, 'Not Received'),
        (REASON_DUPLICATE, 'Duplicate Order'),
        (REASON_OTHER, 'Other'),
    ]

    STATUS_REQUESTED = 'requested'
    STATUS_APPROVED = 'approved'
    STATUS_AWAITING_RETURN = 'awaiting_return'
    STATUS_RECEIVED = 'received'
    STATUS_INSPECTED = 'inspected'
    STATUS_REFUNDED = 'refunded'
    STATUS_REPLACEMENT_SENT = 'replacement_sent'
    STATUS_REJECTED = 'rejected'
    STATUS_CLOSED = 'closed'

    STATUS_CHOICES = [
        (STATUS_REQUESTED, 'Requested'),
        (STATUS_APPROVED, 'Approved'),
        (STATUS_AWAITING_RETURN, 'Awaiting Return'),
        (STATUS_RECEIVED, 'Item Received'),
        (STATUS_INSPECTED, 'Inspected'),
        (STATUS_REFUNDED, 'Refunded'),
        (STATUS_REPLACEMENT_SENT, 'Replacement Sent'),
        (STATUS_REJECTED, 'Rejected'),
        (STATUS_CLOSED, 'Closed'),
    ]

    RESOLUTION_REFUND = 'refund'
    RESOLUTION_REPLACEMENT = 'replacement'
    RESOLUTION_PARTIAL_REFUND = 'partial_refund'
    RESOLUTION_STORE_CREDIT = 'store_credit'
    RESOLUTION_REJECTED = 'rejected'

    RESOLUTION_CHOICES = [
        (RESOLUTION_REFUND, 'Full Refund'),
        (RESOLUTION_REPLACEMENT, 'Replacement'),
        (RESOLUTION_PARTIAL_REFUND, 'Partial Refund'),
        (RESOLUTION_STORE_CREDIT, 'Store Credit'),
        (RESOLUTION_REJECTED, 'Rejected'),
    ]

    rma_number = models.CharField(max_length=30, unique=True)
    sales_order = models.ForeignKey(
        'sales.SalesOrder', on_delete=models.CASCADE, related_name='returns'
    )
    customer = models.ForeignKey(
        'customers.Customer', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='returns'
    )
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_REQUESTED)
    resolution = models.CharField(max_length=30, choices=RESOLUTION_CHOICES, null=True, blank=True)
    description = models.TextField()
    customer_comments = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    replacement_order = models.ForeignKey(
        'sales.SalesOrder', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='replacement_for'
    )
    return_tracking_number = models.CharField(max_length=100, blank=True)
    return_received_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_returns'
    )
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='handled_returns'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['sales_order']),
        ]

    def __str__(self):
        return f"RMA {self.rma_number} for {self.sales_order.order_number}"

    def save(self, *args, **kwargs):
        if not self.rma_number:
            import datetime
            today = datetime.date.today()
            prefix = f"RMA{today.strftime('%Y%m')}"
            last = Return.objects.filter(rma_number__startswith=prefix).order_by('-rma_number').first()
            seq = (int(last.rma_number[-4:]) + 1) if last else 1
            self.rma_number = f"{prefix}{seq:04d}"
        super().save(*args, **kwargs)


class ReturnItem(models.Model):
    return_request = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', null=True, blank=True, on_delete=models.SET_NULL)
    sku = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    condition = models.CharField(max_length=50, blank=True)
    restock = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.return_request.rma_number}: {self.sku} x{self.quantity}"
