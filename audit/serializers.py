from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'user_email', 'action', 'model_name',
                  'object_id', 'object_repr', 'changes', 'ip_address', 'timestamp']
        read_only_fields = ['id', 'timestamp']
