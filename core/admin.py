from django.contrib import admin
from .models import SystemSetting


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ['key', 'is_sensitive', 'updated_by', 'updated_at']
    list_filter = ['is_sensitive']
    search_fields = ['key', 'description']
    readonly_fields = ['updated_at']

    def get_readonly_fields(self, request, obj=None):
        fields = list(self.readonly_fields)
        if obj and obj.is_sensitive and not request.user.is_superuser:
            fields.append('value')
        return fields
