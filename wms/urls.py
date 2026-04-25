from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    WarehouseZoneViewSet, WarehouseLocationViewSet,
    StockLocationAssignmentViewSet, PickingBatchViewSet,
)

router = DefaultRouter()
router.register(r'zones', WarehouseZoneViewSet, basename='wms-zone')
router.register(r'locations', WarehouseLocationViewSet, basename='wms-location')
router.register(r'stock', StockLocationAssignmentViewSet, basename='wms-stock')
router.register(r'batches', PickingBatchViewSet, basename='wms-batch')

urlpatterns = [path('', include(router.urls))]
