# Configuración de Canales en Magnet

Guía completa para conectar cada canal a tu instancia de Magnet.

## 📋 Tabla de Contenidos

1. [WhatsApp Cloud API](#whatsapp-cloud-api)
2. [Instagram Direct Messages](#instagram-direct-messages)
3. [Facebook Messenger](#facebook-messenger)
4. [WordPress Forms](#wordpress-forms)
5. [MongoDB Persistencia](#mongodb-persistencia)
6. [Variables de Entorno](#variables-de-entorno)

---

## WhatsApp Cloud API

### Requisitos

- Cuenta de Meta/Facebook
- Business Account
- WhatsApp Business Account
- Número de teléfono verificado

### Pasos de Configuración

1. **Crear la aplicación en Meta**
   - Ve a [developers.facebook.com](https://developers.facebook.com)
   - Crea nueva app (tipo: Negocio)
   - Selecciona "WhatsApp"

2. **Obtener credenciales**
   - En tu app Meta, ve a "WhatsApp" → "API Setup"
   - Copia: `Phone Number ID`, `WhatsApp Business Account ID`, `App ID`
   - Genera un `Permanent Access Token` (con scope: `whatsapp_business_messaging`)

3. **Configurar webhook en Magnet**
   - En Settings → Chat → WhatsApp
   - Rellena los campos:
     - **ID número de teléfono**: `Phone Number ID` de Meta
     - **ID cuenta WhatsApp Business**: `WABA ID`
     - **ID aplicación Meta**: `App ID`
     - **Token permanente**: Pega el token de acceso

4. **Registrar webhook en Meta**
   - En tu app Meta, ve a "Configuración" → "Webhooks"
   - **URL del Webhook**: Copia de Settings → Chat → WhatsApp → "URL webhook"
   - **Token de verificación**: Copia de Settings → Chat → WhatsApp → "Token de verificación"
   - Envía una solicitud POST para verificar

5. **Probar conexión**
   - Envía un mensaje de prueba desde WhatsApp
   - Debe aparecer en la sección Chat de Magnet
   - Responde desde Magnet
   - El mensaje debe llegar al teléfono

### Troubleshooting

**Error: Webhook no se verifica**
- Verifica que el URL sea accesible desde internet (`https://...`)
- Asegúrate que el token sea exacto (sin espacios)
- Espera 5-10 segundos y reintenta

**Los mensajes no llegan**
- Verifica que `MAGNET_SEND_REAL_WHATSAPP=true` en Cloud Run
- Comprueba que el token sigue válido
- Revisa logs en Meta App Dashboard

---

## Instagram Direct Messages

### Requisitos

- Cuenta de Meta/Facebook
- Instagram Business Account
- Página de Facebook conectada

### Pasos de Configuración

1. **Preparar Instagram Business Account**
   - Convierte tu cuenta de Instagram a Business (Settings → Account Type)
   - Vincula una Página de Facebook a tu Business Account

2. **Crear aplicación Meta**
   - Ve a [developers.facebook.com](https://developers.facebook.com)
   - Crea nueva app (tipo: Negocio)
   - Agrega el producto "Instagram"

3. **Obtener credenciales**
   - En tu app, ve a "Instagram" → "API Setup"
   - Genera un `Permanent Access Token` (scope: `instagram_basic`, `instagram_manage_messages`)
   - Copia tu Page ID (necesario para webhooks)

4. **Configurar en Magnet**
   - Settings → Chat → Instagram
   - **Token de acceso**: Pega el Permanent Access Token

5. **Registrar webhook**
   - En Meta App Dashboard → Webhooks
   - **URL**: Copia de Settings → Chat → Instagram → "URL webhook"
   - **Token de verificación**: Copia de Settings → Chat → Instagram
   - Field subscriptions: `messages`, `messaging_postbacks`

6. **Probar conexión**
   - Envía un DM a tu Business Account desde otra cuenta Instagram
   - Debe aparecer en Chat de Magnet

### Notas

- Instagram no permite respuestas automáticas a todos los mensajes (requiere `MESSAGE_TAG`)
- Los permisos pueden tardar 24-48h en activarse completamente
- Necesitas tener al menos 10k seguidores para algunos features

---

## Facebook Messenger

### Requisitos

- Cuenta de Meta/Facebook
- Página de Facebook
- Aplicación Meta

### Pasos de Configuración

1. **Configurar Página de Facebook**
   - Crea o selecciona una Página existente
   - Ve a Configuración → Integraciones

2. **Obtener credenciales**
   - Ve a [developers.facebook.com](https://developers.facebook.com)
   - Selecciona tu app → "Messenger" → "Settings"
   - Genera un `Page Access Token`
   - Copia tu `Page ID`

3. **Configurar en Magnet**
   - Settings → Chat → Messenger
   - **Token de acceso**: Pega el Page Access Token

4. **Registrar webhook**
   - En tu app → "Webhooks" → "Edit subscription"
   - **URL**: Copia de Settings → Chat → Messenger
   - **Token de verificación**: Copia del mismo lugar
   - Subscriptions: `messages`, `messaging_postbacks`

5. **Verificar en Meta**
   - Haz clic en "Edit" para verificar el webhook
   - Debe cambiar a color verde

6. **Probar**
   - Envía un mensaje a tu Página desde Messenger
   - Debe aparecer en Chat de Magnet
   - Responde desde Magnet

### Notas

- Los `Page Access Tokens` expiran después de 60 días sin uso
- Para producción, considera usar `System User Access Tokens` (más estable)

---

## WordPress Forms

### Requisitos

- Sitio WordPress con plugin de formularios
- Acceso al código del formulario

### Pasos de Configuración

#### Opción A: Contact Form 7

1. **Instalar plugin**
   ```bash
   # En tu WordPress: Plugins → Añadir nuevo
   # Busca "Contact Form 7" e instala
   ```

2. **Configurar webhook en CF7**
   - En tu formulario CF7, ve a "Editar"
   - En la sección "Paneles adicionales", agrega un código personalizado:
   
   ```javascript
   document.addEventListener('wpcf7mailsent', function(event) {
     const webhookUrl = 'https://magnet-xxx.run.app/api/webhooks/ASSISTANT_ID/wordpress';
     const formData = new FormData(event.detail.containerPost);
     
     fetch(webhookUrl, {
       method: 'POST',
       headers: {
         'X-Magnet-Signature': 'sha256=tu-secret-aqui'
       },
       body: JSON.stringify({
         name: formData.get('your-name'),
         email: formData.get('your-email'),
         message: formData.get('your-message'),
         timestamp: Date.now()
       })
     });
   });
   ```

3. **Obtener datos**
   - Settings → Chat → WordPress
   - **URL webhook**: Copia la URL completa
   - **Webhook secret**: Copia el secret
   - Usa estos valores en tu script de CF7

#### Opción B: Webhook directo

Si usas otro plugin o código personalizado:

```bash
curl -X POST https://magnet-xxx.run.app/api/webhooks/ASSISTANT_ID/wordpress \
  -H "Content-Type: application/json" \
  -H "X-Magnet-Signature: sha256=<tu-secret>" \
  -d '{
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "message": "Me interesa saber más",
    "timestamp": 1234567890
  }'
```

4. **Probar**
   - Envía un formulario desde tu sitio WP
   - Debe aparecer como nuevo lead en Magnet Chat

### Notas

- WordPress es asíncrono: los leads aparecen en ~2-5 segundos
- Los emails también se envían normalmente a tu bandeja
- No se envían mensajes de vuelta automáticamente (WordPress no es chat)

---

## MongoDB Persistencia

### ¿Por qué MongoDB?

Sin MongoDB, todos los datos se pierden cuando redeploya:
- Contactos
- Conversaciones
- Mensajes
- Configuración de asistentes

### Opción A: MongoDB Atlas (Gratis)

1. **Crear cuenta**
   - Ve a [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
   - Regístrate gratis
   - Confirma email

2. **Crear cluster**
   - Crea nuevo proyecto
   - Selecciona "Build a Database"
   - Elige plan gratis (M0 - 512MB)
   - Selecciona región (ej: `N. Virginia`)
   - Nombre: `magnet`

3. **Obtener connection string**
   - Ve a "Database Deployments"
   - Haz clic en "Connect"
   - Selecciona "Drivers"
   - Selecciona "Node.js" y versión compatible
   - Copia la connection string (se verá como):
   ```
   mongodb+srv://username:password@cluster.mongodb.net/dbname
   ```

4. **Configurar en Cloud Run**
   ```bash
   gcloud run deploy magnet \
     --set-env-vars="MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/magnet" \
     ...
   ```

5. **Verificar conexión**
   - Abre https://magnet-xxx.run.app
   - Crea un asistente
   - Recarga la página
   - El asistente debe seguir ahí (no desaparecer)

### Opción B: MongoDB Compass (Local)

Para testing local:

```bash
# En tu máquina
mongod  # Inicia el servidor local

# En otra terminal
export MONGO_URI="mongodb://localhost:27017/magnet"
npm run dev
```

### Opción C: Self-hosted (Avanzado)

Puedes hospedar MongoDB en:
- Google Cloud SQL
- AWS DocumentDB
- DigitalOcean
- Tu propio servidor

---

## Variables de Entorno

### En Cloud Run

```bash
gcloud run deploy magnet \
  --set-env-vars=\
MONGO_URI=mongodb+srv://....,\
MAGNET_SEND_REAL_WHATSAPP=true,\
OPENAI_API_KEY=sk-...,\
DEEPSEEK_API_KEY=sk-...,\
JWT_SECRET=tu-secret-aleatorio-aqui,\
ENCRYPTION_KEY=32-bytes-hex-aqui
```

### Disponibles

| Variable | Valor | Nota |
|----------|-------|------|
| `MONGO_URI` | `mongodb+srv://...` | Opcional, sin esto usa memory store |
| `MAGNET_SEND_REAL_WHATSAPP` | `true` / `false` | Default: `false` (modo test) |
| `OPENAI_API_KEY` | `sk-...` | Para usar modelos OpenAI |
| `DEEPSEEK_API_KEY` | `sk-...` | Para usar DeepSeek |
| `DEEPINFRA_API_KEY` | `...` | Para usar DeepInfra |
| `JWT_SECRET` | Cualquier string | Para firmar tokens |
| `ENCRYPTION_KEY` | 32 bytes hex | Para encriptar credenciales |
| `NODE_ENV` | `production` | Auto-set en Cloud Run |
| `PORT` | `8080` | Auto-set en Cloud Run |

### En local (.env)

```bash
# .env
MONGO_URI=mongodb://localhost:27017/magnet
MAGNET_SEND_REAL_WHATSAPP=false
OPENAI_API_KEY=sk-...
JWT_SECRET=dev-secret
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
```

---

## Próximos Pasos

1. Elige qué canales usar
2. Sigue la guía de configuración para cada uno
3. Registra webhooks en Meta/WordPress
4. Configura MongoDB para persistencia
5. Establece variables de entorno en Cloud Run
6. Redeploya con: `./deploy.sh`

---

## Soporte

Si algo no funciona:

1. Revisa logs en Cloud Run:
   ```bash
   gcloud run logs read magnet --limit 50
   ```

2. Verifica que los webhooks sean accesibles:
   ```bash
   curl https://magnet-xxx.run.app/api/health
   ```

3. Comprueba que los tokens sean válidos (revisa en Meta/WordPress)

4. Asegúrate que `MAGNET_SEND_REAL_WHATSAPP=true` si quieres respuestas reales
