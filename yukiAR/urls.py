from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from core import views as core_views

urlpatterns = [
    # Panel de control y CRUD de experiencias
    path('', core_views.dashboard_view, name='dashboard'),
    path('experiences/create/', core_views.experience_create_view, name='experience_create'),
    path('experiences/<int:id>/edit/', core_views.experience_edit_view, name='experience_edit'),
    path('experiences/<int:id>/delete/', core_views.experience_delete_view, name='experience_delete'),

    # Editor y visor
    path('editor/<int:id>/', core_views.editor_view, name='editor'),
    path('viewer/<int:id>/', core_views.viewer_view, name='viewer'),

    # Autenticación
    path('login/', core_views.login_view, name='login'),
    path('logout/', core_views.logout_view, name='logout'),

    # Admin de Django (opcional)
    path('admin/', admin.site.urls),

    # APIs DRF con namespace 'api'
    path('api/', include(('core.urls', 'api'), namespace='api')),

    # Endpoints auxiliares
    path('save_config/<int:id>/', core_views.save_config, name='save_config'),
    path('publish/<int:id>/', core_views.publish_experience, name='publish_experience'),
    path('test-ar/', TemplateView.as_view(template_name='test_ar.html'), name='test_ar'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
