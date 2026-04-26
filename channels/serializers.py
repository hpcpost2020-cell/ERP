from rest_framework import serializers
from .models import Channel, ChannelSyncLog, MarketplaceOrder


class ChannelSyncLogSerializer(serializers.ModelSerializer):
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = ChannelSyncLog
        fields = [
            'id', 'channel', 'sync_type', 'status',
            'records_processed', 'records_created', 'records_updated', 'records_failed',
            'message', 'started_at', 'completed_at', 'duration_seconds',
        ]
        read_only_fields = ['id', 'started_at']

    def get_duration_seconds(self, obj):
        if obj.completed_at and obj.started_at:
            return round((obj.completed_at - obj.started_at).total_seconds(), 1)
        return None


class MarketplaceOrderSerializer(serializers.ModelSerializer):
    sales_order_number = serializers.SerializerMethodField()

    class Meta:
        model = MarketplaceOrder
        fields = [
            'id', 'channel', 'external_order_id', 'external_order_number',
            'status', 'error_message', 'sales_order', 'sales_order_number',
            'fetched_at', 'imported_at',
        ]
        read_only_fields = ['id', 'fetched_at', 'imported_at']

    def get_sales_order_number(self, obj):
        return obj.sales_order.order_number if obj.sales_order_id else None


class ChannelSerializer(serializers.ModelSerializer):
    sync_logs = ChannelSyncLogSerializer(many=True, read_only=True)
    credentials_summary = serializers.SerializerMethodField()

    class Meta:
        model = Channel
        fields = [
            'id', 'name', 'channel_type', 'status',
            'last_synced', 'last_sync_status', 'last_sync_message',
            'auto_import_orders', 'auto_update_stock', 'notes',
            'sync_logs', 'created_at',
            'credentials_summary',
            'api_credentials',  # write-only (see extra_kwargs)
        ]
        read_only_fields = ['id', 'created_at', 'last_synced', 'credentials_summary']
        extra_kwargs = {'api_credentials': {'write_only': True, 'required': False}}

    def get_credentials_summary(self, obj):
        creds = obj.api_credentials or {}
        if obj.channel_type == 'woocommerce':
            ck = creds.get('consumer_key', '')
            hint = (ck[:8] + '…') if len(ck) > 8 else ('set' if ck else '')
            return {
                'store_url': creds.get('store_url', ''),
                'consumer_key_hint': hint,
                'has_secret': bool(creds.get('consumer_secret')),
                'is_configured': bool(
                    creds.get('store_url')
                    and creds.get('consumer_key')
                    and creds.get('consumer_secret')
                ),
            }
        if obj.channel_type == 'ebay':
            return {'is_configured': bool(creds.get('app_id'))}
        if obj.channel_type == 'amazon':
            return {'is_configured': bool(creds.get('seller_id'))}
        return {'is_configured': bool(creds)}
