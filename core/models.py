from django.db import models
from django.conf import settings


class SystemSetting(models.Model):
    """Key/value store for system-wide configuration (company details, VAT rates, API keys, etc.)."""
    key = models.CharField(max_length=200, unique=True, db_index=True)
    value = models.JSONField(default=dict)
    description = models.CharField(max_length=500, blank=True)
    is_sensitive = models.BooleanField(default=False, help_text='Sensitive values are masked in API responses')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='setting_updates'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.key
