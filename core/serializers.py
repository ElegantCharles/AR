from rest_framework import serializers
from .models import Target, Asset, Experience, ExperienceAsset, DetectionMetric

class TargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Target
        fields = '__all__'
        read_only_fields = ('fset','fset3','iset','created_at')

class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = '__all__'
        read_only_fields = ('size_mb','created_at')

class ExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Experience
        fields = '__all__'
        read_only_fields = ('slug','config_json','is_published','views')

class ExperienceAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExperienceAsset
        fields = '__all__'

class DetectionMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetectionMetric
        fields = '__all__'
