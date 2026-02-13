"""
URL Configuration for ALT System
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from apps.entries.urls import project_urlpatterns as project_urls

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('apps.users.urls')),
    path('api/topics/', include('apps.topics.urls')),
    path('api/training-plans/', include('apps.training_plans.urls')),
    path('api/entries/', include('apps.entries.urls')),
    path('api/projects/', include(project_urls)),
    path('api/leaves/', include('apps.leaves.urls')),
    path('api/audit/', include('apps.audit.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
