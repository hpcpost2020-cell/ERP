from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenBlacklistView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    path('api/users/', include('users.urls')),
    path('api/products/', include('products.urls')),
    path('api/suppliers/', include('suppliers.urls')),
    path('api/purchasing/', include('purchasing.urls')),
    path('api/customers/', include('customers.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/shipping/', include('shipping.urls')),
    path('api/channels/', include('channels.urls')),
    path('api/invoicing/', include('invoicing.urls')),
    path('api/returns/', include('returns.urls')),
    path('api/audit/', include('audit.urls')),
    path('api/reports/', include('reporting.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve React SPA
from django.views.generic import TemplateView
from django.http import FileResponse
from pathlib import Path
from django.conf import settings as conf_settings

def serve_frontend(request, *args, **kwargs):
    frontend_index = conf_settings.BASE_DIR / 'frontend' / 'dist' / 'index.html'
    if frontend_index.exists():
        return FileResponse(open(frontend_index, 'rb'), content_type='text/html')
    from django.http import HttpResponse
    return HttpResponse('<h1>Frontend not built. Run: cd frontend && npm run build</h1>')

urlpatterns += [
    path('', serve_frontend),
    path('<path:path>', serve_frontend),
]
