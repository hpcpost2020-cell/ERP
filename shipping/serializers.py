from rest_framework import serializers
from .models import Shipment, CourierIssue


class CourierIssueSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True)

    class Meta:
        model = CourierIssue
        fields = ['id', 'shipment', 'issue_type', 'status', 'description',
                  'claim_reference', 'compensation_amount', 'resolution',
                  'reported_by', 'reported_by_name', 'created_at', 'resolved_at']
        read_only_fields = ['id', 'created_at', 'reported_by']


class ShipmentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='sales_order.order_number', read_only=True)
    issues = CourierIssueSerializer(many=True, read_only=True)
    tracking_link = serializers.CharField(read_only=True)

    class Meta:
        model = Shipment
        fields = ['id', 'sales_order', 'order_number', 'courier', 'service',
                  'tracking_number', 'tracking_url', 'tracking_link',
                  'status', 'weight_kg', 'cost',
                  'dispatched_at', 'delivered_at', 'estimated_delivery',
                  'notes', 'issues', 'created_by', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']
