from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, Count, Avg, Q, F
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from datetime import timedelta, date
from decimal import Decimal

from sales.models import SalesOrder, SalesOrderItem
from products.models import Product, StockLevel
from purchasing.models import PurchaseOrder
from shipping.models import CourierIssue
from returns.models import Return
from customers.models import Customer
from suppliers.models import Supplier


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        yesterday = today - timedelta(days=1)
        week_start = today - timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        qs = SalesOrder.objects.exclude(status__in=['cancelled'])

        def sales_total(qs_filtered):
            return qs_filtered.aggregate(total=Sum('total_value'))['total'] or Decimal('0')

        def sales_count(qs_filtered):
            return qs_filtered.count()

        today_qs = qs.filter(created_at__date=today)
        yesterday_qs = qs.filter(created_at__date=yesterday)
        week_qs = qs.filter(created_at__date__gte=week_start)
        month_qs = qs.filter(created_at__date__gte=month_start)

        # Sales by channel (month)
        channel_data = month_qs.values('channel').annotate(
            total=Sum('total_value'), count=Count('id')
        ).order_by('-total')

        # Best sellers (month) - top 10 by revenue
        best_sellers = SalesOrderItem.objects.filter(
            order__created_at__date__gte=month_start,
        ).exclude(order__status='cancelled').values(
            'sku', 'title'
        ).annotate(
            total_qty=Sum('quantity'),
            total_revenue=Sum(F('quantity') * F('unit_price'))
        ).order_by('-total_qty')[:10]

        # Low stock alerts
        low_stock = []
        for level in StockLevel.objects.select_related('product', 'location').filter(
            product__status='active'
        ):
            if level.is_low_stock:
                low_stock.append({
                    'product_id': level.product.id,
                    'sku': level.product.sku,
                    'title': level.product.title,
                    'location': level.location.code,
                    'qty_available': level.qty_available,
                    'threshold': level.product.low_stock_threshold,
                })
        low_stock.sort(key=lambda x: x['qty_available'])

        # Open / awaiting dispatch orders
        open_orders = SalesOrder.objects.exclude(
            status__in=['completed', 'cancelled', 'refunded', 'delivered']
        ).count()
        awaiting_dispatch = SalesOrder.objects.filter(
            status__in=['pending', 'confirmed', 'processing', 'awaiting_dispatch']
        ).count()

        # Overdue POs
        overdue_pos = PurchaseOrder.objects.filter(
            status__in=['sent', 'acknowledged', 'part_received'],
            expected_delivery_date__lt=today,
        ).count()

        # Returns
        return_count = Return.objects.filter(created_at__date__gte=month_start).count()

        # Courier issues open
        courier_issues = CourierIssue.objects.filter(
            status__in=['open', 'investigating']
        ).count()

        # Estimated profit (month)
        month_items = SalesOrderItem.objects.filter(
            order__created_at__date__gte=month_start,
        ).exclude(order__status__in=['cancelled', 'refunded']).select_related('product')
        revenue = Decimal('0')
        cost = Decimal('0')
        for item in month_items:
            rev = item.unit_price * item.quantity
            revenue += rev
            if item.buy_price_at_time:
                cost += item.buy_price_at_time * item.quantity
            elif item.product:
                cost += item.product.buy_price * item.quantity
        gross_profit = revenue - cost
        margin_pct = round(float(gross_profit / revenue * 100), 2) if revenue > 0 else 0

        # Daily trend last 14 days
        daily_trend = list(
            qs.filter(created_at__date__gte=today - timedelta(days=13))
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(total=Sum('total_value'), count=Count('id'))
            .order_by('day')
        )
        for d in daily_trend:
            d['day'] = d['day'].isoformat()
            d['total'] = float(d['total'] or 0)

        return Response({
            'today_sales': float(sales_total(today_qs)),
            'today_orders': sales_count(today_qs),
            'yesterday_sales': float(sales_total(yesterday_qs)),
            'yesterday_orders': sales_count(yesterday_qs),
            'week_sales': float(sales_total(week_qs)),
            'week_orders': sales_count(week_qs),
            'month_sales': float(sales_total(month_qs)),
            'month_orders': sales_count(month_qs),
            'sales_by_channel': list(channel_data),
            'best_sellers': [
                {
                    'sku': b['sku'],
                    'title': b['title'],
                    'qty_sold': b['total_qty'],
                    'revenue': float(b['total_revenue'] or 0),
                }
                for b in best_sellers
            ],
            'low_stock_count': len(low_stock),
            'low_stock_alerts': low_stock[:20],
            'open_orders': open_orders,
            'awaiting_dispatch': awaiting_dispatch,
            'overdue_pos': overdue_pos,
            'return_count': return_count,
            'courier_issues': courier_issues,
            'gross_profit_month': float(gross_profit),
            'margin_pct_month': margin_pct,
            'daily_trend': daily_trend,
        })


class DailySalesReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        start = date.today() - timedelta(days=days)
        data = list(
            SalesOrder.objects.filter(created_at__date__gte=start)
            .exclude(status='cancelled')
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(
                total=Sum('total_value'),
                orders=Count('id'),
                avg_order=Avg('total_value'),
            )
            .order_by('day')
        )
        for d in data:
            d['day'] = d['day'].isoformat()
            d['total'] = float(d['total'] or 0)
            d['avg_order'] = float(d['avg_order'] or 0)
        return Response(data)


class ChannelPerformanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        start = date.today() - timedelta(days=days)
        data = list(
            SalesOrder.objects.filter(created_at__date__gte=start)
            .exclude(status='cancelled')
            .values('channel')
            .annotate(
                total=Sum('total_value'),
                orders=Count('id'),
                avg_order=Avg('total_value'),
            )
            .order_by('-total')
        )
        for d in data:
            d['total'] = float(d['total'] or 0)
            d['avg_order'] = float(d['avg_order'] or 0)
        return Response(data)


class ProductPerformanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        start = date.today() - timedelta(days=days)
        data = list(
            SalesOrderItem.objects.filter(
                order__created_at__date__gte=start
            ).exclude(order__status__in=['cancelled', 'refunded'])
            .values('sku', 'title')
            .annotate(
                qty_sold=Sum('quantity'),
                revenue=Sum(F('quantity') * F('unit_price')),
                order_count=Count('order', distinct=True),
            )
            .order_by('-revenue')[:100]
        )
        for d in data:
            d['revenue'] = float(d['revenue'] or 0)
        return Response(data)


class CustomerSpendView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = list(
            SalesOrder.objects.exclude(status__in=['cancelled', 'refunded'])
            .filter(customer__isnull=False)
            .values('customer', 'customer__company_name', 'customer__first_name',
                    'customer__last_name', 'customer__email')
            .annotate(
                total_spend=Sum('total_value'),
                order_count=Count('id'),
                avg_order=Avg('total_value'),
            )
            .order_by('-total_spend')[:100]
        )
        for d in data:
            d['total_spend'] = float(d['total_spend'] or 0)
            d['avg_order'] = float(d['avg_order'] or 0)
        return Response(data)


class SupplierSpendView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Sum, Count
        data = list(
            PurchaseOrder.objects.exclude(status='cancelled')
            .values('supplier', 'supplier__name')
            .annotate(
                po_count=Count('id'),
            )
            .order_by('-po_count')[:50]
        )
        return Response(data)


class ProfitReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        start = date.today() - timedelta(days=days)
        orders = SalesOrder.objects.filter(
            created_at__date__gte=start
        ).exclude(status__in=['cancelled', 'refunded']).prefetch_related(
            'items__product'
        )
        rows = []
        for order in orders:
            revenue = float(order.subtotal or 0)
            cost = 0
            for item in order.items.all():
                bp = float(item.buy_price_at_time or 0) or (float(item.product.buy_price) if item.product else 0)
                cost += bp * item.quantity
            profit = revenue - cost
            margin = round(profit / revenue * 100, 2) if revenue > 0 else 0
            rows.append({
                'order_number': order.order_number,
                'channel': order.channel,
                'date': order.created_at.date().isoformat(),
                'revenue': revenue,
                'cost': round(cost, 2),
                'gross_profit': round(profit, 2),
                'margin_pct': margin,
            })
        return Response(rows)


class LowStockReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = []
        for level in StockLevel.objects.select_related('product', 'location').filter(
            product__status='active'
        ):
            rows.append({
                'product_id': level.product.id,
                'sku': level.product.sku,
                'title': level.product.title,
                'location': level.location.code,
                'qty_on_hand': level.qty_on_hand,
                'qty_reserved': level.qty_reserved,
                'qty_available': level.qty_available,
                'threshold': level.product.low_stock_threshold,
                'is_low': level.is_low_stock,
                'reorder_qty': level.product.reorder_quantity,
                'buy_price': float(level.product.buy_price),
            })
        rows.sort(key=lambda x: (not x['is_low'], x['qty_available']))
        return Response(rows)


class OpenPOReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        pos = PurchaseOrder.objects.filter(
            status__in=['draft', 'sent', 'acknowledged', 'part_received']
        ).select_related('supplier').prefetch_related('items__product')
        rows = []
        for po in pos:
            rows.append({
                'po_number': po.po_number,
                'supplier': po.supplier.name,
                'status': po.status,
                'order_date': po.order_date.isoformat() if po.order_date else None,
                'expected_date': po.expected_delivery_date.isoformat() if po.expected_delivery_date else None,
                'is_overdue': (po.expected_delivery_date < today) if po.expected_delivery_date else False,
                'total_value': float(po.total_value),
                'items_count': po.items.count(),
            })
        return Response(rows)


class ReturnsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        days = int(request.query_params.get('days', 30))
        start = date.today() - timedelta(days=days)
        data = list(
            Return.objects.filter(created_at__date__gte=start)
            .values('reason', 'status', 'resolution')
            .annotate(count=Count('id'), total_refund=Sum('refund_amount'))
            .order_by('-count')
        )
        for d in data:
            d['total_refund'] = float(d['total_refund'] or 0)
        return Response(data)
