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


class ChannelListingDetailSerializer(serializers.Serializer):
    """Read serializer for ChannelListing with enriched product info."""
    id = serializers.IntegerField()
    product = serializers.IntegerField(source='product_id')
    product_sku = serializers.CharField(source='product.sku')
    product_title = serializers.CharField(source='product.title')
    channel = serializers.CharField()
    external_id = serializers.CharField()
    parent_id = serializers.CharField()
    external_sku = serializers.CharField()
    channel_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    is_active = serializers.BooleanField()
    last_synced = serializers.DateTimeField(allow_null=True)
    is_variation = serializers.SerializerMethodField()

    def get_is_variation(self, obj):
        return bool(obj.parent_id)


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
            'api_credentials',  # write-only — see extra_kwargs
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
            from datetime import datetime, timezone as _tz
            app_id = creds.get('app_id', '')
            has_token = bool(creds.get('access_token'))
            has_refresh = bool(creds.get('refresh_token'))
            expires_at = creds.get('token_expires_at', '')
            token_valid = False
            if has_token and expires_at:
                try:
                    exp = datetime.fromisoformat(expires_at)
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=_tz.utc)
                    token_valid = datetime.now(_tz.utc) < exp
                except ValueError:
                    pass
            return {
                'app_id_hint': (app_id[:8] + '…') if len(app_id) > 8 else app_id,
                'has_token': has_token,
                'has_refresh_token': has_refresh,
                'token_valid': token_valid,
                'token_expires_at': expires_at,
                'refresh_token_expires_at': creds.get('refresh_token_expires_at', ''),
                'sandbox': bool(creds.get('sandbox', False)),
                'marketplace_id': creds.get('marketplace_id', 'EBAY_GB'),
                'is_configured': bool(app_id and has_token),
            }
        if obj.channel_type == 'amazon':
            seller_id = creds.get('seller_id', '')
            lwa_client_id = creds.get('lwa_client_id', '')
            has_refresh = bool(creds.get('refresh_token'))
            marketplace_id = creds.get('marketplace_id', 'A1F83G8C2ARO7P')
            return {
                'seller_id_hint': (seller_id[:6] + '…') if len(seller_id) > 6 else seller_id,
                'lwa_client_id_hint': (lwa_client_id[:12] + '…') if len(lwa_client_id) > 12 else lwa_client_id,
                'has_refresh_token': has_refresh,
                'marketplace_id': marketplace_id,
                'is_configured': bool(seller_id and lwa_client_id and has_refresh),
            }
        return {'is_configured': bool(creds)}
