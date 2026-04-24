from django.db import models
from django.conf import settings


class Channel(models.Model):
    TYPE_EBAY = 'ebay'
    TYPE_AMAZON = 'amazon'
    TYPE_WOOCOMMERCE = 'woocommerce'
    TYPE_DIRECT = 'direct'
    TYPE_WHOLESALE = 'wholesale'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (TYPE_EBAY, 'eBay'),
        (TYPE_AMAZON, 'Amazon'),
        (TYPE_WOOCOMMERCE, 'WooCommerce'),
        (TYPE_DIRECT, 'Direct'),
        (TYPE_WHOLESALE, 'Wholesale'),
        (TYPE_OTHER, 'Other'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_PAUSED = 'paused'
    STATUS_ERROR = 'error'
    STATUS_INACTIVE = 'inactive'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_PAUSED, 'Paused'),
        (STATUS_ERROR, 'Error / Auth Required'),
        (STATUS_INACTIVE, 'Inactive'),
    ]

    name = models.CharField(max_length=100)
    channel_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    api_credentials = models.JSONField(default=dict, blank=True)
    last_synced = models.DateTimeField(null=True, blank=True)
    last_sync_status = models.CharField(max_length=50, blank=True)
    last_sync_message = models.TextField(blank=True)
    auto_import_orders = models.BooleanField(default=True)
    auto_update_stock = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.channel_type})"


class ChannelSyncLog(models.Model):
    channel = models.ForeignKey(Channel, on_delete=models.CASCADE, related_name='sync_logs')
    sync_type = models.CharField(max_length=30)
    status = models.CharField(max_length=20)
    records_processed = models.IntegerField(default=0)
    records_created = models.IntegerField(default=0)
    records_updated = models.IntegerField(default=0)
    records_failed = models.IntegerField(default=0)
    message = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.channel.name} {self.sync_type} {self.status} @ {self.started_at}"
