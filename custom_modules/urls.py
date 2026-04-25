from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import CustomModuleViewSet, CustomRecordViewSet, CustomFieldViewSet

router = DefaultRouter()
router.register(r'fields', CustomFieldViewSet, basename='custom-field')
router.register(r'', CustomModuleViewSet, basename='custom-module')

# Records are nested under /api/custom-modules/{module_slug}/records/
# Using explicit paths to avoid nested-router prefix conflicts.
record_views = CustomRecordViewSet

urlpatterns = [
    # Records list / create
    path('<slug:module_slug>/records/', record_views.as_view({'get': 'list', 'post': 'create'}), name='custom-record-list'),
    # CSV import
    path('<slug:module_slug>/records/import/', record_views.as_view({'post': 'import_csv'}), name='custom-record-import'),
    # Record detail
    path('<slug:module_slug>/records/<int:pk>/', record_views.as_view({'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy'}), name='custom-record-detail'),
    # File upload on a specific record
    path('<slug:module_slug>/records/<int:pk>/upload-file/', record_views.as_view({'post': 'upload_file'}), name='custom-record-upload'),
    # Module + field routes
    path('', include(router.urls)),
]
