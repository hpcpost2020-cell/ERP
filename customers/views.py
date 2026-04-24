from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

from .models import Customer, CustomerAddress, CustomerNote
from .serializers import CustomerSerializer, CustomerListSerializer, CustomerAddressSerializer, CustomerNoteSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.prefetch_related('addresses', 'customer_notes').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer_type', 'payment_terms']
    search_fields = ['customer_number', 'company_name', 'first_name', 'last_name', 'email', 'phone']
    ordering_fields = ['company_name', 'last_name', 'created_at']
    ordering = ['company_name']

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
        return CustomerSerializer

    def perform_create(self, serializer):
        import datetime
        today = datetime.date.today()
        prefix = f"CUST{today.strftime('%Y')}"
        from .models import Customer as C
        last = C.objects.filter(customer_number__startswith=prefix).order_by('-customer_number').first()
        seq = (int(last.customer_number[-4:]) + 1) if last else 1
        customer_number = f"{prefix}{seq:04d}"
        serializer.save(created_by=self.request.user, customer_number=customer_number)

    @action(detail=True, methods=['get'], url_path='orders')
    def orders(self, request, pk=None):
        customer = self.get_object()
        from sales.models import SalesOrder
        from sales.serializers import SalesOrderListSerializer
        orders = SalesOrder.objects.filter(customer=customer).order_by('-created_at')[:50]
        return Response(SalesOrderListSerializer(orders, many=True).data)

    @action(detail=True, methods=['get'], url_path='invoices')
    def invoices(self, request, pk=None):
        customer = self.get_object()
        from invoicing.serializers import InvoiceListSerializer
        invoices = customer.invoices.all()[:50]
        return Response(InvoiceListSerializer(invoices, many=True).data)


class CustomerAddressViewSet(viewsets.ModelViewSet):
    queryset = CustomerAddress.objects.all()
    serializer_class = CustomerAddressSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['customer', 'address_type']


class CustomerNoteViewSet(viewsets.ModelViewSet):
    queryset = CustomerNote.objects.select_related('created_by').all()
    serializer_class = CustomerNoteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['customer', 'is_important']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
