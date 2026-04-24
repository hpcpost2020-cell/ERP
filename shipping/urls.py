from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ShipmentViewSet, CourierIssueViewSet

router = DefaultRouter()
router.register(r'issues', CourierIssueViewSet, basename='courier-issue')
router.register(r'', ShipmentViewSet, basename='shipment')

urlpatterns = [path('', include(router.urls))]
