from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EntryViewSet, ProjectViewSet

router = DefaultRouter()
router.register(r'', EntryViewSet)

project_router = DefaultRouter()
project_router.register(r'', ProjectViewSet, basename='project')

urlpatterns = [
    path('', include(router.urls)),
]

project_urlpatterns = [
    path('', include(project_router.urls)),
]
