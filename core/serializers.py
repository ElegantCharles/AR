# core/serializers.py
from rest_framework import serializers
from .models import Target, Asset, Experience, ExperienceAsset, DetectionMetric


class TargetSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Target
        fields = ['id', 'name', 'image', 'pattfile', 'created_at']
        read_only_fields = ['id', 'created_at']


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Asset
        fields = ['id', 'name', 'file', 'type', 'size_mb', 'created_at']
        read_only_fields = ['id', 'size_mb', 'created_at']


# core/serializers.py
class ExperienceSerializer(serializers.ModelSerializer):
    targets = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Target.objects.all(), required=False
    )

    class Meta:
        model  = Experience
        fields = ['id', 'name', 'slug', 'is_published', 'views', 'targets']
        read_only_fields = ['id', 'slug', 'is_published', 'views']


class ExperienceAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ExperienceAsset
        fields = [
            'id', 'experience', 'asset', 'target', 'transform',
            'autoplay', 'loop', 'face_user'
        ]
        read_only_fields = ['id']


class DetectionMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DetectionMetric
        fields = ['id', 'experience', 'detected_at']
        read_only_fields = ['id', 'detected_at']
