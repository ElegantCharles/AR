# core/views.py
import os
import subprocess
from django.db.models import F 
from pathlib import Path

import qrcode
from django.conf             import settings
from django.shortcuts        import render, redirect, get_object_or_404
from django.template.loader  import render_to_string
from django.contrib.auth     import authenticate, login, logout
from django.contrib.auth.decorators import login_required

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers     import MultiPartParser, FormParser
from rest_framework.response    import Response
from django_filters.rest_framework import DjangoFilterBackend

from .forms       import ExperienceForm
from .models      import Target, Asset, Experience, ExperienceAsset, DetectionMetric
from .serializers import (
    TargetSerializer, AssetSerializer, ExperienceSerializer,
    ExperienceAssetSerializer, DetectionMetricSerializer
)


# ---------- Vistas HTML ----------
def login_view(request):
    if request.method == 'POST':
        user = authenticate(
            request,
            username=request.POST['username'],
            password=request.POST['password']
        )
        if user:
            login(request, user)
            return redirect('dashboard')
        return render(request, 'login.html', {'error': 'Credenciales inválidas'})
    return render(request, 'login.html')


def logout_view(request):
    logout(request)
    return redirect('login')


@login_required
def dashboard_view(request):
    exps = Experience.objects.all().order_by('-id')
    return render(request, 'dashboard.html', {'experiences': exps})


@login_required
def experience_create_view(request):
    form = ExperienceForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        exp = form.save()
        return redirect('editor', id=exp.id)
    return render(request, 'experience_form.html', {
        'form': form,
        'title': 'Crear Experiencia'
    })


@login_required
def experience_edit_view(request, id):
    exp = get_object_or_404(Experience, pk=id)
    form = ExperienceForm(request.POST or None, instance=exp)
    if request.method == 'POST' and form.is_valid():
        form.save()
        return redirect('dashboard')
    return render(request, 'experience_form.html', {
        'form': form,
        'title': 'Editar Experiencia'
    })


@login_required
def experience_delete_view(request, id):
    exp = get_object_or_404(Experience, pk=id)
    if request.method == 'POST':
        exp.delete()
        return redirect('dashboard')
    return render(request, 'experience_confirm_delete.html', {'experience': exp})


@login_required
def editor_view(request, id):
    return render(request, 'editor.html', {'experience_id': id})


@login_required
def viewer_view(request, id):
    exp = get_object_or_404(Experience, pk=id, is_published=True)
    exp.views = F('views') + 1
    exp.save(update_fields=['views'])
    return render(request, 'viewer.html', {'experience': exp})


# ---------- API REST ----------
class TargetViewSet(viewsets.ModelViewSet):
    queryset         = Target.objects.all().order_by('-created_at')
    serializer_class = TargetSerializer
    parser_classes   = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]
    filter_backends  = [DjangoFilterBackend]
    filterset_fields = [
        'experience__id',            # ✅  → /api/targets/?experience__id=1
        'experienceasset__experience'
    ]

    # --- helpers -------------------------------------------------
    def _generate_nft(self, image_path: str) -> Path:
        """
        Ejecuta @webarkit/nft-marker-creator-app y devuelve el prefijo (Path sin extensión).
        """
        out_dir = Path(image_path).parent
        base    = Path(image_path).stem
        script  = Path(
            settings.BASE_DIR,
            'tools', 'nft-marker',
            'node_modules', '@webarkit',
            'nft-marker-creator-app', 'src', 'NFTMarkerCreator.js'
        )

        subprocess.run(
            ['node', str(script),
             '-i', str(image_path),
             '-o', str(out_dir),
             '-noConf'],
            check=True,
            stdout=subprocess.DEVNULL
        )
        return out_dir / base

    # -------------------------------------------------------------
    def perform_create(self, serializer):
        target = serializer.save()
        marker_prefix = self._generate_nft(target.image.path)
        target.pattfile.name = os.path.relpath(marker_prefix, settings.MEDIA_ROOT)
        target.save(update_fields=['pattfile'])

    def perform_update(self, serializer):
        instance = serializer.save()
        if 'image' in serializer.validated_data:   # regenera sólo si cambió img
            self.perform_create(serializer)


class AssetViewSet(viewsets.ModelViewSet):
    queryset         = Asset.objects.all().order_by('-created_at')
    serializer_class = AssetSerializer
    parser_classes   = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]


class ExperienceViewSet(viewsets.ModelViewSet):
    queryset         = Experience.objects.all().order_by('-id')
    serializer_class = ExperienceSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['PATCH'])
    def save_config(self, request, pk=None):
        exp = self.get_object()
        exp.config_json = request.data.get('config_json', {})
        exp.save(update_fields=['config_json'])
        return Response({'status': 'config saved'})

    @action(detail=True, methods=['POST'])
    def publish(self, request, pk=None):
        exp = self.get_object()

        total_size = sum(ea.asset.file.size for ea in exp.experienceasset_set.all())
        if total_size > 50 * 1024 * 1024:
            return Response({'error': 'Contenido demasiado grande'}, status=400)

        exp.is_published = True
        exp.save(update_fields=['is_published'])

        # Render estático del visor
        html = render_to_string('viewer.html', {'experience': exp}, request=request)
        out  = Path(settings.MEDIA_ROOT, f'viewer_{exp.id}.html')
        out.write_text(html, encoding='utf-8')

        # QR corto
        qr = qrcode.make(request.build_absolute_uri(f'/viewer/{exp.id}/'))
        qr.save(Path(settings.MEDIA_ROOT, f'qr_exp_{exp.id}.png'))

        return Response({'viewer_url': f'{settings.MEDIA_URL}{out.name}'})


class ExperienceAssetViewSet(viewsets.ModelViewSet):
    queryset         = ExperienceAsset.objects.all()
    serializer_class = ExperienceAssetSerializer
    permission_classes = [IsAuthenticated]


class DetectionMetricViewSet(viewsets.ModelViewSet):
    queryset         = DetectionMetric.objects.all()
    serializer_class = DetectionMetricSerializer
    permission_classes = [AllowAny]  # se permite desde el visor público

    def create(self, request, *args, **kwargs):
        super().create(request, *args, **kwargs)
        return Response({'status': 'metric saved'}, status=status.HTTP_201_CREATED)


# ---------- Aux endpoints (sin auth porque vienen del visor público) ----------
@api_view(['PATCH'])
@permission_classes([AllowAny])
def save_config(request, id):
    exp = get_object_or_404(Experience, pk=id)
    exp.config_json = request.data.get('config_json', {})
    exp.save(update_fields=['config_json'])
    return Response({'status': 'config updated'})


@api_view(['POST'])
@permission_classes([AllowAny])
def publish_experience(request, id):
    exp = get_object_or_404(Experience, pk=id)
    if exp.is_published:
        return Response({'error': 'Ya publicada'}, status=400)

    exp.is_published = True
    exp.save(update_fields=['is_published'])

    html = render_to_string('viewer.html', {'experience': exp}, request=request)
    out  = Path(settings.MEDIA_ROOT, f'viewer_{exp.id}.html')
    out.write_text(html, encoding='utf-8')

    return Response({'viewer_url': f'{settings.MEDIA_URL}{out.name}'})
