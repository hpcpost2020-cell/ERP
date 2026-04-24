from django.urls import path
from .views import (
    DashboardView, DailySalesReportView, ChannelPerformanceView,
    ProductPerformanceView, CustomerSpendView, SupplierSpendView,
    ProfitReportView, LowStockReportView, OpenPOReportView, ReturnsReportView
)

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('daily-sales/', DailySalesReportView.as_view(), name='daily-sales'),
    path('channel-performance/', ChannelPerformanceView.as_view(), name='channel-performance'),
    path('product-performance/', ProductPerformanceView.as_view(), name='product-performance'),
    path('customer-spend/', CustomerSpendView.as_view(), name='customer-spend'),
    path('supplier-spend/', SupplierSpendView.as_view(), name='supplier-spend'),
    path('profit/', ProfitReportView.as_view(), name='profit-report'),
    path('low-stock/', LowStockReportView.as_view(), name='low-stock-report'),
    path('open-pos/', OpenPOReportView.as_view(), name='open-po-report'),
    path('returns/', ReturnsReportView.as_view(), name='returns-report'),
]
