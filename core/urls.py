from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TargetViewSet, AssetViewSet, ExperienceViewSet,
    ExperienceAssetViewSet, DetectionMetricViewSet
)

router = DefaultRouter()
router.register(r'targets', TargetViewSet)
router.register(r'assets', AssetViewSet)
router.register(r'experiences', ExperienceViewSet)
router.register(r'exp-assets', ExperienceAssetViewSet)
router.register(r'metrics', DetectionMetricViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
