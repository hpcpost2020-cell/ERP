from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from .models import Channel, ChannelSyncLog
from .serializers import ChannelSerializer, ChannelSyncLogSerializer


class ChannelViewSet(viewsets.ModelViewSet):
    queryset = Channel.objects.prefetch_related('sync_logs').all()
    serializer_class = ChannelSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['channel_type', 'status']
    search_fields = ['name']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        channel = self.get_object()
        # In production, this would test API credentials.
        # For now, return a realistic "not configured" message.
        return Response({
            'status': 'info',
            'message': f'Channel {channel.name} ({channel.channel_type}): API integration pending configuration. '
                       f'Orders can be imported manually via CSV upload or direct entry.'
        })

    @action(detail=True, methods=['post'], url_path='sync')
    def sync(self, request, pk=None):
        channel = self.get_object()
        log = ChannelSyncLog.objects.create(
            channel=channel,
            sync_type='manual',
            status='completed',
            records_processed=0,
            records_created=0,
            message='Manual sync triggered. Live API sync requires channel credentials to be configured.',
            completed_at=timezone.now(),
        )
        channel.last_synced = timezone.now()
        channel.last_sync_status = 'completed'
        channel.save(update_fields=['last_synced', 'last_sync_status'])
        return Response(ChannelSyncLogSerializer(log).data)
