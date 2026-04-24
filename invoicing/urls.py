from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import InvoiceViewSet, PaymentViewSet

router = DefaultRouter()
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'', InvoiceViewSet, basename='invoice')

urlpatterns = [path('', include(router.urls))]
