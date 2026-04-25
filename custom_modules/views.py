import csv
import io
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import CustomModule, CustomField, CustomRecord, CustomRecordFile
from .serializers import (
    CustomModuleSerializer, CustomModuleListSerializer,
    CustomFieldSerializer, CustomRecordSerializer, CustomRecordListSerializer,
    CustomRecordFileSerializer,
)


class CustomModuleViewSet(viewsets.ModelViewSet):
    queryset = CustomModule.objects.prefetch_related('fields').select_related('created_by').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'slug', 'description']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    lookup_field = 'slug'

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomModuleListSerializer
        return CustomModuleSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get', 'post'], url_path='fields')
    def fields(self, request, slug=None):
        module = self.get_object()
        if request.method == 'GET':
            serializer = CustomFieldSerializer(module.fields.all(), many=True)
            return Response(serializer.data)
        # POST — add a new field to this module
        data = request.data.copy()
        data['module'] = module.pk
        serializer = CustomFieldSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save(module=module)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete', 'patch'], url_path=r'fields/(?P<field_id>[^/.]+)')
    def field_detail(self, request, slug=None, field_id=None):
        module = self.get_object()
        try:
            field = module.fields.get(pk=field_id)
        except CustomField.DoesNotExist:
            return Response({'detail': 'Field not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.method == 'DELETE':
            field.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        # PATCH
        serializer = CustomFieldSerializer(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='export')
    def export(self, request, slug=None):
        module = self.get_object()
        fields = list(module.fields.order_by('order').values_list('field_name', flat=True))
        records = module.records.all()

        output = io.StringIO()
        writer = csv.writer(output)
        # Header row
        writer.writerow(['reference_number', 'created_at'] + fields)
        for record in records:
            row = [record.reference_number, record.created_at.strftime('%Y-%m-%d %H:%M')]
            for field_name in fields:
                row.append(record.data.get(field_name, ''))
            writer.writerow(row)

        from django.http import HttpResponse
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{module.slug}-records.csv"'
        return response


class CustomRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['related_customer', 'related_sales_order', 'related_product']
    search_fields = ['reference_number', 'data']
    ordering_fields = ['created_at', 'reference_number']
    ordering = ['-created_at']

    def get_queryset(self):
        slug = self.kwargs.get('module_slug')
        qs = CustomRecord.objects.select_related(
            'module', 'created_by', 'related_customer', 'related_sales_order', 'related_product'
        ).prefetch_related('files')
        if slug:
            qs = qs.filter(module__slug=slug)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomRecordListSerializer
        return CustomRecordSerializer

    def perform_create(self, serializer):
        slug = self.kwargs.get('module_slug')
        try:
            module = CustomModule.objects.get(slug=slug)
        except CustomModule.DoesNotExist:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'module': 'Module not found.'})
        serializer.save(module=module, created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='import')
    def import_csv(self, request, module_slug=None):
        try:
            module = CustomModule.objects.get(slug=module_slug)
        except CustomModule.DoesNotExist:
            return Response({'detail': 'Module not found.'}, status=status.HTTP_404_NOT_FOUND)

        csv_file = request.FILES.get('file')
        if not csv_file:
            return Response({'detail': 'file field is required (CSV).'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            content = csv_file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(content))
        except Exception as e:
            return Response({'detail': f'Failed to parse CSV: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        errors = []
        for i, row in enumerate(reader, start=2):
            try:
                data = {k.strip(): v.strip() for k, v in row.items() if k and k not in ('reference_number', 'created_at')}
                CustomRecord.objects.create(module=module, data=data, created_by=request.user)
                created_count += 1
            except Exception as e:
                errors.append({'row': i, 'error': str(e)})

        return Response({
            'created': created_count,
            'errors': errors,
            'detail': f'{created_count} records imported successfully.',
        }, status=status.HTTP_201_CREATED if created_count > 0 else status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='upload-file')
    def upload_file(self, request, pk=None, module_slug=None):
        record = self.get_object()
        file_obj = request.FILES.get('file')
        field_name = request.data.get('field_name', 'file')
        if not file_obj:
            return Response({'detail': 'file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        attachment = CustomRecordFile.objects.create(
            record=record,
            field_name=field_name,
            file=file_obj,
            original_name=file_obj.name,
            uploaded_by=request.user,
        )
        return Response(CustomRecordFileSerializer(attachment).data, status=status.HTTP_201_CREATED)


class CustomFieldViewSet(viewsets.ModelViewSet):
    """Standalone field management (used by admin / module builder UI)."""
    queryset = CustomField.objects.select_related('module').all()
    serializer_class = CustomFieldSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['module', 'field_type', 'required']
    search_fields = ['field_name', 'field_label', 'module__name']
