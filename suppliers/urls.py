from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import SupplierViewSet, SupplierProductViewSet, SupplierIssueViewSet

router = DefaultRouter()
router.register(r'products', SupplierProductViewSet, basename='supplier-product')
router.register(r'issues', SupplierIssueViewSet, basename='supplier-issue')
router.register(r'', SupplierViewSet, basename='supplier')

urlpatterns = [path('', include(router.urls))]
