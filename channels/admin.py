from django.contrib import admin
from .models import Channel, ChannelSyncLog, MarketplaceOrder


class ChannelSyncLogInline(admin.TabularInline):
    model = ChannelSyncLog
    extra = 0
    readonly_fields = ['sync_type', 'status', 'records_processed', 'records_created', 'records_updated', 'records_failed', 'started_at', 'completed_at']
    can_delete = False
    max_num = 10


@admin.register(Channel)
class ChannelAdmin(admin.ModelAdmin):
    list_display = ['name', 'channel_type', 'status', 'last_synced', 'auto_import_orders', 'auto_update_stock']
    list_filter = ['channel_type', 'status', 'auto_import_orders']
    search_fields = ['name']
    readonly_fields = ['last_synced', 'last_sync_status', 'last_sync_message', 'created_at']
    inlines = [ChannelSyncLogInline]


@admin.register(MarketplaceOrder)
class MarketplaceOrderAdmin(admin.ModelAdmin):
    list_display = ['external_order_id', 'channel', 'status', 'external_order_number', 'fetched_at', 'imported_at']
    list_filter = ['status', 'channel']
    search_fields = ['external_order_id', 'external_order_number']
    readonly_fields = ['fetched_at', 'imported_at']
    date_hierarchy = 'fetched_at'
