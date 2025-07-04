import os
from django.db import models
from django.utils.text import slugify

class Target(models.Model):
    name = models.CharField(max_length=100, unique=True)
    image = models.ImageField(upload_to='targets/')
    mindfile = models.FileField(upload_to='targets/', blank=True, null=True)
    fset = models.FileField(upload_to='targets/', blank=True)
    fset3 = models.FileField(upload_to='targets/', blank=True)
    iset = models.FileField(upload_to='targets/', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Asset(models.Model):
    TYPE_CHOICES = [
        ('model', 'Modelo'),
        ('image', 'Imagen'),
        ('video', 'Video'),
        ('audio', 'Audio'),
    ]
    name = models.CharField(max_length=100)
    file = models.FileField(upload_to='assets/')
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    size_mb = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Calcular tamaño en MB
        if self.file:
            self.size_mb = self.file.size / (1024 * 1024)
            super().save(update_fields=['size_mb'])

    def __str__(self):
        return self.name

class Experience(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, blank=True)
    targets = models.ManyToManyField(Target, blank=True)
    config_json = models.JSONField(blank=True, default=dict)
    is_published = models.BooleanField(default=False)
    views = models.IntegerField(default=0)

    def save(self, *args, **kwargs):
        # Generar slug único a partir del nombre
        if not self.slug:
            base = slugify(self.name)
            slug = base
            i = 1
            while Experience.objects.filter(slug=slug).exists():
                slug = f"{base}-{i}"
                i += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class ExperienceAsset(models.Model):
    experience = models.ForeignKey(Experience, on_delete=models.CASCADE)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE)
    target = models.ForeignKey(Target, on_delete=models.CASCADE)
    transform = models.JSONField(default=dict)  # {'pos':[x,y,z], 'rot':[x,y,z], 'scale':[x,y,z]} NO TOCAR
    autoplay = models.BooleanField(default=False)
    loop = models.BooleanField(default=False)
    face_user = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.experience.name} - {self.asset.name} on {self.target.name}"

class DetectionMetric(models.Model):
    experience = models.ForeignKey(Experience, on_delete=models.CASCADE)
    detected_at = models.DateTimeField(auto_now_add=True)
