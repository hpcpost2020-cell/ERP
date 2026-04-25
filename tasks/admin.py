from django.contrib import admin
from .models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['title', 'priority', 'status', 'assigned_to', 'due_date', 'created_at']
    list_filter = ['status', 'priority', 'assigned_to']
    search_fields = ['title', 'description', 'related_label']
    readonly_fields = ['created_at', 'updated_at', 'completed_at']
    date_hierarchy = 'due_date'
    fieldsets = (
        (None, {'fields': ('title', 'description', 'priority', 'status')}),
        ('Assignment', {'fields': ('assigned_to', 'due_date')}),
        ('Related Record', {'fields': ('related_model', 'related_id', 'related_label'), 'classes': ('collapse',)}),
        ('Audit', {'fields': ('created_by', 'created_at', 'updated_at', 'completed_at'), 'classes': ('collapse',)}),
    )
