# core/forms.py
from django import forms
from .models import Experience

class ExperienceForm(forms.ModelForm):
    class Meta:
        model = Experience
        fields = ['name']
        widgets = {
            'name': forms.TextInput(attrs={
                'class': 'w-full border-gray-300 rounded p-2 focus:ring-indigo-500 focus:border-indigo-500',
                'placeholder': 'Nombre del proyecto'
            }),
        }
