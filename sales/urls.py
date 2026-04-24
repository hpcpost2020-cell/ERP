from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import SalesOrderViewSet, OrderNoteViewSet

router = DefaultRouter()
router.register(r'notes', OrderNoteViewSet, basename='order-note')
router.register(r'', SalesOrderViewSet, basename='sales-order')

urlpatterns = [path('', include(router.urls))]
