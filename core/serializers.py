from rest_framework import serializers
from .models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source='updated_by.get_full_name', read_only=True, allow_null=True)
    value_display = serializers.SerializerMethodField()

    class Meta:
        model = SystemSetting
        fields = ['id', 'key', 'value', 'value_display', 'description', 'is_sensitive', 'updated_by', 'updated_by_name', 'updated_at']
        read_only_fields = ['id', 'updated_by', 'updated_at']
        lookup_field = 'key'

    def get_value_display(self, obj):
        if obj.is_sensitive:
            return '••••••••'
        return obj.value


class SystemSettingBulkSerializer(serializers.Serializer):
    """For bulk-updating multiple settings in one request."""
    settings = serializers.DictField(
        child=serializers.JSONField(),
        help_text='Dict of {key: value} pairs to update'
    )
