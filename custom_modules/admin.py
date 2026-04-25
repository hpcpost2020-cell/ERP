from django.contrib import admin
from .models import CustomModule, CustomField, CustomRecord, CustomRecordFile


class CustomFieldInline(admin.TabularInline):
    model = CustomField
    extra = 1
    fields = ['field_name', 'field_label', 'field_type', 'required', 'order', 'options', 'help_text']


@admin.register(CustomModule)
class CustomModuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'icon', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'slug', 'description']
    readonly_fields = ['slug', 'created_at', 'updated_at']
    inlines = [CustomFieldInline]


@admin.register(CustomField)
class CustomFieldAdmin(admin.ModelAdmin):
    list_display = ['module', 'field_label', 'field_name', 'field_type', 'required', 'order']
    list_filter = ['module', 'field_type', 'required']
    search_fields = ['field_name', 'field_label', 'module__name']


class CustomRecordFileInline(admin.TabularInline):
    model = CustomRecordFile
    extra = 0
    readonly_fields = ['uploaded_at', 'uploaded_by']


@admin.register(CustomRecord)
class CustomRecordAdmin(admin.ModelAdmin):
    list_display = ['reference_number', 'module', 'related_customer', 'related_sales_order', 'created_at']
    list_filter = ['module']
    search_fields = ['reference_number']
    readonly_fields = ['reference_number', 'created_at', 'updated_at']
    inlines = [CustomRecordFileInline]
