from django.db import models
from django.conf import settings
from decimal import Decimal
import datetime


def generate_invoice_number():
    today = datetime.date.today()
    prefix = f"INV{today.strftime('%Y')}"
    last = Invoice.objects.filter(invoice_number__startswith=prefix).order_by('-invoice_number').first()
    if last:
        try:
            seq = int(last.invoice_number[-6:]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:06d}"


class Invoice(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_ISSUED = 'issued'
    STATUS_SENT = 'sent'
    STATUS_PART_PAID = 'part_paid'
    STATUS_PAID = 'paid'
    STATUS_OVERDUE = 'overdue'
    STATUS_VOID = 'void'
    STATUS_CREDIT = 'credit'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_ISSUED, 'Issued'),
        (STATUS_SENT, 'Sent to Customer'),
        (STATUS_PART_PAID, 'Part Paid'),
        (STATUS_PAID, 'Paid'),
        (STATUS_OVERDUE, 'Overdue'),
        (STATUS_VOID, 'Void'),
        (STATUS_CREDIT, 'Credit Note'),
    ]

    invoice_number = models.CharField(max_length=30, unique=True, db_index=True)
    sales_order = models.ForeignKey(
        'sales.SalesOrder', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='invoices'
    )
    customer = models.ForeignKey(
        'customers.Customer', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='invoices'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    issue_date = models.DateField()
    due_date = models.DateField()
    payment_terms = models.CharField(max_length=20, blank=True)

    # Financial
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    vat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    currency = models.CharField(max_length=3, default='GBP')

    # Customer billing details (denormalised)
    bill_to_name = models.CharField(max_length=255, blank=True)
    bill_to_company = models.CharField(max_length=255, blank=True)
    bill_to_address = models.TextField(blank=True)

    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_invoices'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['due_date']),
        ]

    def __str__(self):
        return f"{self.invoice_number} - {self.customer} - £{self.total_amount}"

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = generate_invoice_number()
        super().save(*args, **kwargs)

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid

    @property
    def is_overdue(self):
        import datetime
        return self.due_date < datetime.date.today() and self.status in [self.STATUS_ISSUED, self.STATUS_SENT, self.STATUS_PART_PAID]


class InvoiceItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    description = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_pct = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('20.00'))

    class Meta:
        ordering = ['id']

    @property
    def line_total(self):
        return self.unit_price * self.quantity * (1 - self.discount_pct / 100)

    @property
    def line_vat(self):
        return self.line_total * (self.vat_rate / 100)


class Payment(models.Model):
    METHOD_BANK_TRANSFER = 'bank_transfer'
    METHOD_CARD = 'card'
    METHOD_PAYPAL = 'paypal'
    METHOD_CHEQUE = 'cheque'
    METHOD_CASH = 'cash'
    METHOD_OTHER = 'other'

    METHOD_CHOICES = [
        (METHOD_BANK_TRANSFER, 'Bank Transfer'),
        (METHOD_CARD, 'Card'),
        (METHOD_PAYPAL, 'PayPal'),
        (METHOD_CHEQUE, 'Cheque'),
        (METHOD_CASH, 'Cash'),
        (METHOD_OTHER, 'Other'),
    ]

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    reference = models.CharField(max_length=100, blank=True)
    payment_date = models.DateField()
    notes = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def __str__(self):
        return f"Payment £{self.amount} for {self.invoice.invoice_number} via {self.method}"
