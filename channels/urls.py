from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import ChannelViewSet

router = DefaultRouter()
router.register(r'', ChannelViewSet, basename='channel')

urlpatterns = [path('', include(router.urls))]
