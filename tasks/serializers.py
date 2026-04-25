from rest_framework import serializers
from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, allow_null=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'title', 'description', 'due_date', 'priority', 'status',
            'assigned_to', 'assigned_to_name',
            'created_by', 'created_by_name',
            'related_model', 'related_id', 'related_label',
            'is_overdue', 'created_at', 'updated_at', 'completed_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'completed_at']

    def get_is_overdue(self, obj):
        from django.utils import timezone
        if obj.due_date and obj.status not in [Task.STATUS_DONE, Task.STATUS_CANCELLED]:
            return obj.due_date < timezone.now()
        return False


class TaskListSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True, allow_null=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'title', 'priority', 'status',
            'assigned_to', 'assigned_to_name',
            'due_date', 'is_overdue', 'related_label', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_is_overdue(self, obj):
        from django.utils import timezone
        if obj.due_date and obj.status not in [Task.STATUS_DONE, Task.STATUS_CANCELLED]:
            return obj.due_date < timezone.now()
        return False
