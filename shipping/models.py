from django.db import models
from django.conf import settings
from decimal import Decimal


class Shipment(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_LABEL_CREATED = 'label_created'
    STATUS_DISPATCHED = 'dispatched'
    STATUS_IN_TRANSIT = 'in_transit'
    STATUS_OUT_FOR_DELIVERY = 'out_for_delivery'
    STATUS_DELIVERED = 'delivered'
    STATUS_FAILED_DELIVERY = 'failed_delivery'
    STATUS_RETURNED = 'returned'
    STATUS_LOST = 'lost'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_LABEL_CREATED, 'Label Created'),
        (STATUS_DISPATCHED, 'Dispatched'),
        (STATUS_IN_TRANSIT, 'In Transit'),
        (STATUS_OUT_FOR_DELIVERY, 'Out for Delivery'),
        (STATUS_DELIVERED, 'Delivered'),
        (STATUS_FAILED_DELIVERY, 'Failed Delivery'),
        (STATUS_RETURNED, 'Returned to Sender'),
        (STATUS_LOST, 'Lost / Missing'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    COURIER_EVRI = 'evri'
    COURIER_ROYAL_MAIL = 'royal_mail'
    COURIER_DPD = 'dpd'
    COURIER_DHL = 'dhl'
    COURIER_UPS = 'ups'
    COURIER_FEDEX = 'fedex'
    COURIER_YODEL = 'yodel'
    COURIER_PARCELFORCE = 'parcelforce'
    COURIER_OTHER = 'other'

    COURIER_CHOICES = [
        (COURIER_EVRI, 'Evri (Hermes)'),
        (COURIER_ROYAL_MAIL, 'Royal Mail'),
        (COURIER_DPD, 'DPD'),
        (COURIER_DHL, 'DHL'),
        (COURIER_UPS, 'UPS'),
        (COURIER_FEDEX, 'FedEx'),
        (COURIER_YODEL, 'Yodel'),
        (COURIER_PARCELFORCE, 'Parcelforce'),
        (COURIER_OTHER, 'Other'),
    ]

    sales_order = models.ForeignKey(
        'sales.SalesOrder', on_delete=models.CASCADE, related_name='shipments'
    )
    courier = models.CharField(max_length=20, choices=COURIER_CHOICES, default=COURIER_EVRI)
    service = models.CharField(max_length=100, blank=True)
    tracking_number = models.CharField(max_length=100, blank=True, db_index=True)
    tracking_url = models.URLField(blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_PENDING)
    weight_kg = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    label_data = models.TextField(blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    estimated_delivery = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_shipments'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tracking_number']),
            models.Index(fields=['status']),
            models.Index(fields=['sales_order']),
        ]

    def __str__(self):
        return f"Shipment {self.tracking_number or 'No tracking'} for {self.sales_order.order_number}"

    @property
    def tracking_link(self):
        if self.tracking_url:
            return self.tracking_url
        tracking_urls = {
            self.COURIER_EVRI: f"https://www.evri.com/track/{self.tracking_number}",
            self.COURIER_ROYAL_MAIL: f"https://www.royalmail.com/track-your-item#/tracking-results/{self.tracking_number}",
            self.COURIER_DPD: f"https://www.dpd.co.uk/apps/tracking/?reference={self.tracking_number}",
        }
        return tracking_urls.get(self.courier, '')


class CourierIssue(models.Model):
    TYPE_LOST = 'lost'
    TYPE_DAMAGED = 'damaged'
    TYPE_DELAYED = 'delayed'
    TYPE_FAILED_DELIVERY = 'failed_delivery'
    TYPE_WRONG_ADDRESS = 'wrong_address'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (TYPE_LOST, 'Lost Parcel'),
        (TYPE_DAMAGED, 'Damaged in Transit'),
        (TYPE_DELAYED, 'Delayed'),
        (TYPE_FAILED_DELIVERY, 'Failed Delivery Attempt'),
        (TYPE_WRONG_ADDRESS, 'Wrong Address / Undeliverable'),
        (TYPE_OTHER, 'Other'),
    ]

    STATUS_OPEN = 'open'
    STATUS_INVESTIGATING = 'investigating'
    STATUS_CLAIM_SUBMITTED = 'claim_submitted'
    STATUS_RESOLVED = 'resolved'
    STATUS_CLOSED = 'closed'

    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_INVESTIGATING, 'Investigating'),
        (STATUS_CLAIM_SUBMITTED, 'Claim Submitted'),
        (STATUS_RESOLVED, 'Resolved'),
        (STATUS_CLOSED, 'Closed'),
    ]

    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name='issues')
    issue_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_OPEN)
    description = models.TextField()
    claim_reference = models.CharField(max_length=100, blank=True)
    compensation_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    resolution = models.TextField(blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='reported_courier_issues'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.issue_type} for shipment {self.shipment.tracking_number}"
