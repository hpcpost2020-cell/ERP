from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_ADMIN = 'admin'
    ROLE_WAREHOUSE = 'warehouse'
    ROLE_CUSTOMER_SERVICE = 'customer_service'
    ROLE_ACCOUNTS = 'accounts'
    ROLE_MANAGEMENT = 'management'

    ROLE_CHOICES = [
        (ROLE_ADMIN, 'Admin'),
        (ROLE_WAREHOUSE, 'Warehouse'),
        (ROLE_CUSTOMER_SERVICE, 'Customer Service'),
        (ROLE_ACCOUNTS, 'Accounts'),
        (ROLE_MANAGEMENT, 'Management'),
    ]

    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default=ROLE_CUSTOMER_SERVICE)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def can_manage_users(self):
        return self.role == self.ROLE_ADMIN

    @property
    def can_edit_prices(self):
        return self.role in [self.ROLE_ADMIN, self.ROLE_ACCOUNTS, self.ROLE_MANAGEMENT]

    @property
    def can_adjust_stock(self):
        return self.role in [self.ROLE_ADMIN, self.ROLE_WAREHOUSE, self.ROLE_MANAGEMENT]

    @property
    def can_create_po(self):
        return self.role in [self.ROLE_ADMIN, self.ROLE_WAREHOUSE, self.ROLE_MANAGEMENT, self.ROLE_ACCOUNTS]
