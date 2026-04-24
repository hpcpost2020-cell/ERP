from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import CustomerViewSet, CustomerAddressViewSet, CustomerNoteViewSet

router = DefaultRouter()
router.register(r'addresses', CustomerAddressViewSet, basename='customer-address')
router.register(r'notes', CustomerNoteViewSet, basename='customer-note')
router.register(r'', CustomerViewSet, basename='customer')

urlpatterns = [path('', include(router.urls))]
