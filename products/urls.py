from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    CategoryViewSet, ProductViewSet, StockLocationViewSet,
    StockLevelViewSet, StockMovementViewSet,
    UnitOfMeasureViewSet, UoMConversionViewSet,
)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'locations', StockLocationViewSet)
router.register(r'stock-levels', StockLevelViewSet)
router.register(r'stock-movements', StockMovementViewSet)
router.register(r'uom', UnitOfMeasureViewSet, basename='uom')
router.register(r'uom-conversions', UoMConversionViewSet, basename='uom-conversion')
router.register(r'', ProductViewSet, basename='product')

urlpatterns = [path('', include(router.urls))]
