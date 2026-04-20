# Verificar configuración de Google Cloud

## Checklisten:

1. **Billing habilitado**:
   - Ve a https://console.cloud.google.com/billing
   - Asegúrate que tu proyecto "stebo-vertex" está vinculado a una cuenta de facturación
   - Debe haber un método de pago activo

2. **APIs habilitadas**:
   - Ve a https://console.cloud.google.com/apis/dashboard
   - Busca "Vertex AI API" → debe mostrar "Enabled" (verde)
   - Busca "Generative Language API" → debe mostrar "Enabled" (verde)

3. **Modelos disponibles**:
   - Ve a https://console.cloud.google.com/vertex-ai/generative
   - Haz click en "Generative AI Studio" o "Create"
   - En la sección "Multimodal" deberían aparecer opciones de Gemini
   - Si no ve ningún modelo, haz click en "Enable" si aparece

4. **Permisos de Service Account**:
   - Ve a https://console.cloud.google.com/iam-admin/iam
   - Busca tu service account (`vertex-ai-sa@stebo-vertex.iam.gserviceaccount.com`)
   - Debe tener estos roles:
     - Vertex AI User
     - Service Account User
     - Editor (o más restrictivo)

5. **Region y disponibilidad**:
   - Algunos modelos solo están disponibles en ciertas regiones
   - `us-central1` debe funcionar para Gemini
   - Si aún no funciona, intenta `us-west1` o `europe-west4`

## Si todo dice "OK" pero los modelos no funcionan:

Espera 5-10 minutos después de habilitar las APIs - Google Cloud necesita tiempo para propagar los cambios.

Luego intenta el botón "Genereer met Gemini" en stebo-reclame nuevamente.
