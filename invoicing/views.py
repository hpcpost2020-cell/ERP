from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.http import HttpResponse
from django.conf import settings
import io
from datetime import date

from .models import Invoice, Payment
from .serializers import InvoiceSerializer, InvoiceListSerializer, PaymentSerializer


def generate_invoice_pdf(invoice):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    story = []

    # Header
    header_data = [
        [Paragraph(f"<b>{settings.COMPANY_NAME}</b>", styles['Heading1']),
         Paragraph(f"<b>INVOICE</b>", styles['Heading1'])],
        [Paragraph(settings.COMPANY_ADDRESS, styles['Normal']),
         Paragraph(f"Invoice #: {invoice.invoice_number}", styles['Normal'])],
        [Paragraph(f"Tel: {settings.COMPANY_PHONE}", styles['Normal']),
         Paragraph(f"Date: {invoice.issue_date}", styles['Normal'])],
        [Paragraph(f"VAT: {settings.COMPANY_VAT}", styles['Normal']),
         Paragraph(f"Due: {invoice.due_date}", styles['Normal'])],
    ]
    header_table = Table(header_data, colWidths=[100*mm, 80*mm])
    header_table.setStyle(TableStyle([
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8*mm))

    # Bill to
    bill_to = invoice.bill_to_company or invoice.bill_to_name or (invoice.customer.display_name if invoice.customer else '')
    story.append(Paragraph(f"<b>Bill To:</b>", styles['Normal']))
    story.append(Paragraph(bill_to, styles['Normal']))
    if invoice.bill_to_address:
        story.append(Paragraph(invoice.bill_to_address.replace('\n', '<br/>'), styles['Normal']))
    story.append(Spacer(1, 6*mm))

    # Items table
    item_data = [['Description', 'SKU', 'Qty', 'Unit Price', 'VAT%', 'Total']]
    for item in invoice.items.all():
        item_data.append([
            item.description,
            item.sku or '',
            str(item.quantity),
            f"£{item.unit_price:.2f}",
            f"{item.vat_rate}%",
            f"£{item.line_total:.2f}",
        ])
    item_table = Table(item_data, colWidths=[70*mm, 25*mm, 15*mm, 25*mm, 15*mm, 25*mm])
    item_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e3a5f')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f5f7fa')]),
        ('ALIGN', (2,0), (-1,-1), 'RIGHT'),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 6*mm))

    # Totals
    totals_data = [
        ['', 'Subtotal:', f"£{invoice.subtotal:.2f}"],
        ['', 'Discount:', f"-£{invoice.discount_amount:.2f}"],
        ['', 'VAT:', f"£{invoice.vat_amount:.2f}"],
        ['', 'TOTAL:', f"£{invoice.total_amount:.2f}"],
        ['', 'Paid:', f"£{invoice.amount_paid:.2f}"],
        ['', 'Balance Due:', f"£{invoice.balance_due:.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[100*mm, 45*mm, 30*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
        ('FONTNAME', (1,3), (-1,3), 'Helvetica-Bold'),
        ('FONTNAME', (1,5), (-1,5), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('LINEABOVE', (1,3), (-1,3), 1, colors.black),
        ('LINEABOVE', (1,5), (-1,5), 1.5, colors.black),
        ('TEXTCOLOR', (1,5), (-1,5), colors.HexColor('#1e3a5f')),
    ]))
    story.append(totals_table)

    if invoice.notes:
        story.append(Spacer(1, 6*mm))
        story.append(Paragraph(f"<b>Notes:</b> {invoice.notes}", styles['Normal']))

    doc.build(story)
    buf.seek(0)
    return buf


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related('customer', 'sales_order').prefetch_related('items', 'payments').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer', 'sales_order']
    search_fields = ['invoice_number', 'customer__company_name', 'customer__email', 'bill_to_name']
    ordering_fields = ['invoice_number', 'issue_date', 'due_date', 'total_amount', 'created_at']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return InvoiceListSerializer
        return InvoiceSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'], url_path='pdf')
    def download_pdf(self, request, pk=None):
        invoice = self.get_object()
        buf = generate_invoice_pdf(invoice)
        response = HttpResponse(buf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="Invoice_{invoice.invoice_number}.pdf"'
        from audit.utils import log_action
        log_action(request, 'export', 'Invoice', str(invoice.pk), str(invoice), {})
        return response

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        invoice = self.get_object()
        serializer = PaymentSerializer(data={**request.data, 'invoice': invoice.pk})
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(recorded_by=request.user, invoice=invoice)
        invoice.amount_paid = sum(p.amount for p in invoice.payments.all())
        if invoice.amount_paid >= invoice.total_amount:
            invoice.status = Invoice.STATUS_PAID
        elif invoice.amount_paid > 0:
            invoice.status = Invoice.STATUS_PART_PAID
        invoice.save(update_fields=['amount_paid', 'status'])
        return Response(PaymentSerializer(payment).data, status=201)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'detail': 'order_id required'}, status=400)
        from sales.models import SalesOrder
        import datetime
        try:
            order = SalesOrder.objects.get(pk=order_id)
        except SalesOrder.DoesNotExist:
            return Response({'detail': 'Order not found'}, status=404)

        invoice = Invoice.objects.create(
            sales_order=order,
            customer=order.customer,
            status=Invoice.STATUS_ISSUED,
            issue_date=datetime.date.today(),
            due_date=datetime.date.today(),
            subtotal=order.subtotal,
            vat_amount=order.vat_amount,
            discount_amount=order.discount_amount,
            total_amount=order.total_value,
            bill_to_name=order.bill_to_name or order.ship_to_name,
            bill_to_company=order.bill_to_company,
            bill_to_address=f"{order.bill_to_address1}\n{order.bill_to_city} {order.bill_to_postcode}",
            created_by=request.user,
        )
        for item in order.items.all():
            InvoiceItem = __import__('invoicing.models', fromlist=['InvoiceItem']).InvoiceItem
            InvoiceItem.objects.create(
                invoice=invoice,
                description=item.title,
                sku=item.sku,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount_pct=item.discount_pct,
                vat_rate=item.vat_rate,
            )
        return Response(InvoiceSerializer(invoice).data, status=201)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('invoice', 'recorded_by').all()
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['invoice', 'method']
    ordering = ['-payment_date']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)
