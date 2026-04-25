from django.db import models
from django.conf import settings
from django.utils.text import slugify
import datetime


class CustomModule(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, default='folder', blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='custom_modules'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class CustomField(models.Model):
    TYPE_TEXT = 'text'
    TYPE_TEXTAREA = 'textarea'
    TYPE_NUMBER = 'number'
    TYPE_DATE = 'date'
    TYPE_DROPDOWN = 'dropdown'
    TYPE_CHECKBOX = 'checkbox'
    TYPE_FILE = 'file'
    TYPE_RELATION = 'relation'
    TYPE_EMAIL = 'email'
    TYPE_URL = 'url'

    FIELD_TYPES = [
        (TYPE_TEXT, 'Text'),
        (TYPE_TEXTAREA, 'Text Area'),
        (TYPE_NUMBER, 'Number'),
        (TYPE_DATE, 'Date'),
        (TYPE_DROPDOWN, 'Dropdown'),
        (TYPE_CHECKBOX, 'Checkbox'),
        (TYPE_FILE, 'File Upload'),
        (TYPE_RELATION, 'Relation'),
        (TYPE_EMAIL, 'Email'),
        (TYPE_URL, 'URL'),
    ]

    module = models.ForeignKey(CustomModule, on_delete=models.CASCADE, related_name='fields')
    field_name = models.SlugField(max_length=100)
    field_label = models.CharField(max_length=100)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    options = models.JSONField(default=list, blank=True)
    required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    help_text = models.CharField(max_length=255, blank=True)
    relation_model = models.CharField(max_length=100, blank=True)
    default_value = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['order', 'id']
        unique_together = ['module', 'field_name']

    def __str__(self):
        return f"{self.module.name}: {self.field_label}"


class CustomRecord(models.Model):
    module = models.ForeignKey(CustomModule, on_delete=models.CASCADE, related_name='records')
    reference_number = models.CharField(max_length=30, blank=True, db_index=True)
    data = models.JSONField(default=dict)
    related_customer = models.ForeignKey(
        'customers.Customer', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='custom_records'
    )
    related_sales_order = models.ForeignKey(
        'sales.SalesOrder', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='custom_records'
    )
    related_product = models.ForeignKey(
        'products.Product', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='custom_records'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='custom_records'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.module.name} #{self.reference_number or self.pk}"

    def save(self, *args, **kwargs):
        if not self.reference_number:
            today = datetime.date.today()
            slug_prefix = self.module.slug.upper().replace('-', '')[:6]
            prefix = f"{slug_prefix}{today.strftime('%Y%m')}"
            last = CustomRecord.objects.filter(
                module=self.module,
                reference_number__startswith=prefix
            ).order_by('-reference_number').first()
            if last and last.reference_number:
                try:
                    seq = int(last.reference_number[-4:]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1
            self.reference_number = f"{prefix}{seq:04d}"
        super().save(*args, **kwargs)


class CustomRecordFile(models.Model):
    """File attachments for CustomRecord entries."""
    record = models.ForeignKey(CustomRecord, on_delete=models.CASCADE, related_name='files')
    field_name = models.CharField(max_length=100)
    file = models.FileField(upload_to='custom_module_files/%Y/%m/')
    original_name = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.record} — {self.original_name}"
