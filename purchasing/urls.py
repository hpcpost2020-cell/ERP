from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    PurchaseOrderViewSet, SupplierCreditNoteViewSet,
    GoodsReceiptViewSet, GoodsReceiptItemViewSet,
)

router = DefaultRouter()
router.register(r'credit-notes', SupplierCreditNoteViewSet, basename='credit-note')
router.register(r'receipts', GoodsReceiptViewSet, basename='goods-receipt')
router.register(r'qc-items', GoodsReceiptItemViewSet, basename='qc-item')
router.register(r'', PurchaseOrderViewSet, basename='purchase-order')

urlpatterns = [path('', include(router.urls))]
