from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import SystemSettingViewSet, GlobalSearchView

router = DefaultRouter()
router.register(r'', SystemSettingViewSet, basename='setting')

urlpatterns = [
    path('search/', GlobalSearchView.as_view(), name='global-search'),
    path('', include(router.urls)),
]
