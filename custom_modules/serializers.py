from rest_framework import serializers
from .models import CustomModule, CustomField, CustomRecord, CustomRecordFile


class CustomFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomField
        fields = [
            'id', 'module', 'field_name', 'field_label', 'field_type',
            'options', 'required', 'order', 'help_text', 'relation_model', 'default_value',
        ]
        read_only_fields = ['id', 'module']


class CustomModuleSerializer(serializers.ModelSerializer):
    fields = CustomFieldSerializer(many=True, read_only=True)
    records_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = CustomModule
        fields = [
            'id', 'name', 'slug', 'icon', 'description', 'is_active',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'fields', 'records_count',
        ]
        read_only_fields = ['id', 'slug', 'created_by', 'created_at', 'updated_at']

    def get_records_count(self, obj):
        return obj.records.count()


class CustomModuleListSerializer(serializers.ModelSerializer):
    records_count = serializers.SerializerMethodField()
    fields_count = serializers.SerializerMethodField()

    class Meta:
        model = CustomModule
        fields = ['id', 'name', 'slug', 'icon', 'description', 'is_active', 'records_count', 'fields_count', 'created_at']
        read_only_fields = ['id', 'slug', 'created_at']

    def get_records_count(self, obj):
        return obj.records.count()

    def get_fields_count(self, obj):
        return obj.fields.count()


class CustomRecordFileSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = CustomRecordFile
        fields = ['id', 'record', 'field_name', 'file', 'original_name', 'uploaded_by', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = ['id', 'record', 'uploaded_by', 'uploaded_at']


class CustomRecordSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source='module.name', read_only=True)
    module_slug = serializers.CharField(source='module.slug', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, allow_null=True)
    related_customer_name = serializers.SerializerMethodField()
    related_order_number = serializers.SerializerMethodField()
    related_product_sku = serializers.SerializerMethodField()
    files = CustomRecordFileSerializer(many=True, read_only=True)

    class Meta:
        model = CustomRecord
        fields = [
            'id', 'module', 'module_name', 'module_slug',
            'reference_number', 'data',
            'related_customer', 'related_customer_name',
            'related_sales_order', 'related_order_number',
            'related_product', 'related_product_sku',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
            'files',
        ]
        read_only_fields = ['id', 'reference_number', 'module', 'created_by', 'created_at', 'updated_at']

    def get_related_customer_name(self, obj):
        if obj.related_customer:
            return obj.related_customer.company_name or f"{obj.related_customer.first_name} {obj.related_customer.last_name}".strip()
        return None

    def get_related_order_number(self, obj):
        return obj.related_sales_order.order_number if obj.related_sales_order else None

    def get_related_product_sku(self, obj):
        return obj.related_product.sku if obj.related_product else None


class CustomRecordListSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source='module.name', read_only=True)

    class Meta:
        model = CustomRecord
        fields = [
            'id', 'module', 'module_name', 'reference_number',
            'data', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'reference_number', 'module', 'created_at', 'updated_at']
