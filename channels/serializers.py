from rest_framework import serializers
from .models import Channel, ChannelSyncLog


class ChannelSyncLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelSyncLog
        fields = ['id', 'channel', 'sync_type', 'status', 'records_processed',
                  'records_created', 'records_updated', 'records_failed',
                  'message', 'started_at', 'completed_at']
        read_only_fields = ['id', 'started_at']


class ChannelSerializer(serializers.ModelSerializer):
    sync_logs = ChannelSyncLogSerializer(many=True, read_only=True)

    class Meta:
        model = Channel
        fields = ['id', 'name', 'channel_type', 'status', 'last_synced',
                  'last_sync_status', 'last_sync_message',
                  'auto_import_orders', 'auto_update_stock', 'notes',
                  'sync_logs', 'created_at']
        read_only_fields = ['id', 'created_at', 'last_synced']
        extra_kwargs = {'api_credentials': {'write_only': True}}
