from django.contrib import admin
from .models import Shipment, CourierIssue


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'sales_order', 'courier', 'status', 'tracking_number', 'cost', 'dispatched_at']
    list_filter = ['courier', 'status']
    search_fields = ['tracking_number', 'sales_order__order_number']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(CourierIssue)
class CourierIssueAdmin(admin.ModelAdmin):
    list_display = ['shipment', 'issue_type', 'status', 'claim_reference', 'created_at']
    list_filter = ['issue_type', 'status']
    search_fields = ['shipment__tracking_number', 'claim_reference']
    readonly_fields = ['created_at', 'resolved_at']
