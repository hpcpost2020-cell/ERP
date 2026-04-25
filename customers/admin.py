from django.contrib import admin
from .models import Customer, CustomerAddress, CustomerNote


class CustomerAddressInline(admin.StackedInline):
    model = CustomerAddress
    extra = 0
    fields = ['address_type', 'is_default', 'address_line1', 'address_line2', 'city', 'county', 'postcode', 'country']


class CustomerNoteInline(admin.TabularInline):
    model = CustomerNote
    extra = 0
    fields = ['content', 'is_important', 'created_by', 'created_at']
    readonly_fields = ['created_at']


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['customer_number', 'company_name', 'first_name', 'last_name', 'email', 'customer_type', 'status']
    list_filter = ['customer_type', 'status', 'payment_terms']
    search_fields = ['customer_number', 'company_name', 'first_name', 'last_name', 'email']
    readonly_fields = ['customer_number', 'created_at', 'updated_at']
    inlines = [CustomerAddressInline, CustomerNoteInline]
