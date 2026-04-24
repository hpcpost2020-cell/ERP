from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ReturnViewSet

router = DefaultRouter()
router.register(r'', ReturnViewSet, basename='return')

urlpatterns = [path('', include(router.urls))]
