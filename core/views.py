import os
import qrcode
import subprocess
from .forms import ExperienceForm  
from django.template.loader import render_to_string
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from .models import Target, Asset, Experience, ExperienceAsset, DetectionMetric
from .serializers import (
    TargetSerializer, AssetSerializer, ExperienceSerializer,
    ExperienceAssetSerializer, DetectionMetricSerializer
)

# ----- Vistas de login/plantillas -----

def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return redirect('dashboard')
        else:
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
def experience_edit_view(request, id):
    exp = get_object_or_404(Experience, pk=id)
    if request.method == 'POST':
        form = ExperienceForm(request.POST, instance=exp)
        if form.is_valid():
            form.save()
            return redirect('dashboard')
    else:
        form = ExperienceForm(instance=exp)
    return render(request, 'experience_form.html', {'form': form, 'title': 'Editar Experiencia'})

@login_required
def experience_delete_view(request, id):
    exp = get_object_or_404(Experience, pk=id)
    if request.method == 'POST':
        exp.delete()
        return redirect('dashboard')
    return render(request, 'experience_confirm_delete.html', {'experience': exp})

@login_required
def experience_create_view(request):
    if request.method == 'POST':
        form = ExperienceForm(request.POST)
        if form.is_valid():
            exp = form.save()
            return redirect('editor', id=exp.id)
    else:
        form = ExperienceForm()
    return render(request, 'experience_form.html', {
        'form': form,
        'title': 'Crear Experiencia'
    })

@login_required
def editor_view(request, id):
    return render(request, 'editor.html', {'experience_id': id})

@login_required
def viewer_view(request, id):
    exp = get_object_or_404(Experience, pk=id, is_published=True)
    return render(request, 'viewer.html', {'experience': exp})

# ----- APIs con DRF -----

class TargetViewSet(viewsets.ModelViewSet):
    queryset = Target.objects.all().order_by('-created_at')
    serializer_class = TargetSerializer
    parser_classes = (MultiPartParser, FormParser)

    def perform_create(self, serializer):
        target = serializer.save()
        # Generar archivos NFT usando arjs-cli
        image_path = target.image.path
        output_dir = os.path.dirname(image_path)
        prefix = os.path.splitext(os.path.basename(image_path))[0]
        # Ejecutar arjs-cli para generar fset, fset3, iset
        subprocess.run(["npx", "arjs", "generate", image_path, "--output", output_dir])
        # Asignar archivos generados al modelo
        fset_path = os.path.join(output_dir, prefix + '.fset')
        fset3_path = os.path.join(output_dir, prefix + '.fset3')
        iset_path = os.path.join(output_dir, prefix + '.iset')
        if os.path.exists(fset_path):
            target.fset.name = os.path.relpath(fset_path, settings.MEDIA_ROOT)
        if os.path.exists(fset3_path):
            target.fset3.name = os.path.relpath(fset3_path, settings.MEDIA_ROOT)
        if os.path.exists(iset_path):
            target.iset.name = os.path.relpath(iset_path, settings.MEDIA_ROOT)
        target.save()

    def perform_update(self, serializer):
        self.perform_create(serializer)  # volver a generar al actualizar

class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all().order_by('-created_at')
    serializer_class = AssetSerializer
    parser_classes = (MultiPartParser, FormParser)

class ExperienceViewSet(viewsets.ModelViewSet):
    queryset = Experience.objects.all().order_by('-id')
    serializer_class = ExperienceSerializer

    @action(detail=True, methods=['PATCH'])
    def save_config(self, request, pk=None):
        exp = self.get_object()
        exp.config_json = request.data.get('config_json', {})
        exp.save()
        return Response({'status': 'config saved'})

    @action(detail=True, methods=['POST'])
    def publish(self, request, pk=None):
        exp = self.get_object()
        # Validar que exista al menos un target y assets configurados
        total_size = 0
        for ea in exp.experienceasset_set.all():
            total_size += ea.asset.file.size
        # Limite ejemplo: 50 MB
        if total_size > 50 * 1024 * 1024:
            return Response({'error': 'Contenido demasiado grande'}, status=400)
        exp.is_published = True
        exp.save()
        # Generar HTML estático y código QR
        html_content = render(None, 'viewer.html', {'experience': exp}).content.decode('utf-8')
        viewer_path = os.path.join(settings.MEDIA_ROOT, f'viewer_{exp.id}.html')
        with open(viewer_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        qr = qrcode.make(request.build_absolute_uri(f'/viewer/{exp.id}/'))
        qr.save(os.path.join(settings.MEDIA_ROOT, f'qr_exp_{exp.id}.png'))
        return Response({'status': 'published'})

class ExperienceAssetViewSet(viewsets.ModelViewSet):
    queryset = ExperienceAsset.objects.all()
    serializer_class = ExperienceAssetSerializer

class DetectionMetricViewSet(viewsets.ModelViewSet):
    queryset = DetectionMetric.objects.all()
    serializer_class = DetectionMetricSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response({'status': 'metric saved'}, status=status.HTTP_201_CREATED)

# ----- Funciones de ruta especial -----

@api_view(['PATCH'])
@permission_classes([AllowAny])
def save_config(request, id):
    exp = get_object_or_404(Experience, pk=id)
    exp.config_json = request.data.get('config_json', {})
    exp.save()
    return Response({'status': 'config updated'})

@api_view(['POST'])
@permission_classes([AllowAny])
def publish_experience(request, id):
    exp = get_object_or_404(Experience, pk=id)
    if exp.is_published:
        return Response({'error': 'La experiencia ya está publicada'}, status=400)

    # lee marker_type ('pattern' o 'nft'), por defecto 'nft'
    marker = request.data.get('marker_type', 'nft')
    # guarda elección en config_json
    config = exp.config_json or {}
    config['marker_type'] = marker
    exp.config_json = config
    exp.is_published = True
    exp.save()

    # renderiza el viewer usando la variable marker_type
    html = render_to_string(
        'viewer.html',
        {'experience': exp, 'marker_type': marker},
        request=request
    )
    out_path = os.path.join(settings.MEDIA_ROOT, f'viewer_{exp.id}.html')
    os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)

    return Response({
        'status': 'Publicado correctamente',
        'viewer_url': f'{settings.MEDIA_URL}viewer_{exp.id}.html'
    })
