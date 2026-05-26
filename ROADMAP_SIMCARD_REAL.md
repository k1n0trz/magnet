# Magnet: diagnostico y roadmap para probar con SIM real

Magnet ya tiene la base correcta para parecerse al flujo de Sellerchat: panel de asistentes, configuracion de canales, webhook de verificacion de Meta, parsing de mensajes entrantes, generacion de respuesta IA, envio por Graph API y persistencia opcional en MongoDB. Todavia no esta listo para una prueba productiva con SIM real sin cerrar los puntos P0 de dominio, persistencia, secretos, seguridad de webhooks e idempotencia.

## Estado actual

- Frontend: React/Vite funcional, UI multi-canal y ajustes por asistente. En esta revision se corrigio el overflow horizontal de dashboard en movil y la lista responsive de canales en Ajustes.
- API: Express con `/api/bootstrap`, asistentes, mensajes manuales, simulador, triggers, plantillas, tags y healthcheck.
- Webhooks: ruta unificada `/api/webhooks/:assistantId/:channel` y ruta legacy `/api/whatsapp/webhook/:assistantId`.
- WhatsApp: valida `hub.mode`, `hub.verify_token` y `hub.challenge`; parsea payloads entrantes; envia texto por `POST https://graph.facebook.com/{version}/{phoneNumberId}/messages` cuando `MAGNET_SEND_REAL_WHATSAPP=true`.
- IA: proveedor local de fallback y OpenAI por `OPENAI_API_KEY`. DeepSeek/DeepInfra aparecen en UI pero no tienen implementacion real todavia.
- Persistencia: memory store para dev y MongoDB opcional. Para SIM real, MongoDB deja de ser opcional.
- Tests actuales: handlers, webhooks y helpers de seguridad. La suite pasa localmente.

## Bloqueantes antes de comprar/probar la SIM

1. Dominio real y HTTPS estable.
   - Definir dominio/subdominio, por ejemplo `panel.magnetcrm.co`.
   - Apuntar DNS al deployment elegido.
   - Configurar certificado TLS.
   - Setear `APP_BASE_URL=https://panel...` y redeployar.
   - Actualizar los `webhookUrl` ya guardados en asistentes, porque se generan al crear el asistente y no cambian automaticamente cuando cambia `APP_BASE_URL`.

2. Persistencia productiva.
   - Configurar `MONGO_URI`.
   - Confirmar que asistentes, canales, conversaciones y tokens sobreviven a redeploy/restart.
   - Mantener `ENCRYPTION_KEY` estable: si cambia despues de guardar tokens, Magnet no podra desencriptarlos.

3. Credenciales y modo real.
   - Configurar `JWT_SECRET`, `ENCRYPTION_KEY`, `MONGO_URI`, `APP_BASE_URL`, `META_GRAPH_VERSION` y `MAGNET_SEND_REAL_WHATSAPP=true`.
   - Guardar en Ajustes > Chat > WhatsApp: Phone Number ID, WABA ID, App ID y token permanente.
   - Validar que el token se guarde cifrado y se pueda usar despues de recargar el panel.

4. Seguridad de webhook Meta.
   - Agregar `META_APP_SECRET` por canal/app.
   - Validar `X-Hub-Signature-256` en WhatsApp, Messenger e Instagram. Hoy solo WordPress valida HMAC propio.

5. Idempotencia y reintentos.
   - Evitar duplicados por `channelMessageId`, porque Meta puede reintentar webhooks.
   - Responder `200 OK` rapido al webhook y mover IA/envio a una cola o job interno. Hoy el webhook espera la IA y el envio antes de responder.

6. Ventana de 24 horas y plantillas.
   - Confirmar comportamiento para mensajes iniciados por usuario vs. negocio.
   - Implementar envio de plantillas aprobadas cuando aplique.
   - Sincronizar estado real de plantillas con Meta si se vendera como plataforma tipo Sellerchat.

## Roadmap recomendado

### Fase 0 - Base de produccion

- Elegir hosting final: Cloud Run o Vercel + API.
- Configurar dominio real y HTTPS.
- Setear variables productivas y MongoDB.
- Crear script/migracion para regenerar `webhookUrl` de asistentes al dominio final.
- Hacer smoke test de `/api/health`, `/api/bootstrap` y webhook GET de Meta sobre el dominio real.

### Fase 1 - WhatsApp real con una SIM

- Comprar/activar SIM con operador, sin activar WhatsApp en un celular.
- En Meta Business/WhatsApp Manager, agregar y verificar el numero.
- Obtener `Phone Number ID` y `WhatsApp Business Account ID`.
- Crear/usar app de Meta con producto WhatsApp.
- Crear token permanente de System User con permisos de WhatsApp necesarios.
- Pegar credenciales en Magnet.
- Configurar webhook de Meta con:
  - Callback URL: `https://dominio/api/webhooks/{assistantId}/whatsapp`
  - Verify token: el token generado por Magnet
  - Suscripcion minima: mensajes entrantes de WhatsApp
- Enviar mensaje desde otro WhatsApp y confirmar:
  - Se crea contacto.
  - Se crea conversacion.
  - Se guarda inbound.
  - Se genera outbound.
  - Meta retorna message id.
  - El cliente recibe la respuesta.

### Fase 2 - Robustez para pruebas con clientes

- Validar firma `X-Hub-Signature-256`.
- Agregar deduplicacion por `channelMessageId`.
- Separar webhook ack de procesamiento IA/envio.
- Registrar logs estructurados por `assistantId`, canal, `messageId`, estado de envio y error de Meta.
- Agregar endpoint/accion de "probar conexion" desde el panel.
- Agregar UI segura para secretos: mostrar estado configurado o mascara, no el ciphertext.

### Fase 3 - Plataforma tipo Sellerchat

- Multi-tenant real: usuarios, roles, ownership de asistentes y permisos.
- Control de cuotas/conversaciones y facturacion.
- Templates con creacion/sync/aprobacion Meta.
- Bandeja humana con asignaciones, pausas de bot y handoff.
- Analitica por canal, conversion, lead score y costos.
- Soporte completo para Instagram/Messenger con permisos, tokens y webhooks propios.
- WooCommerce: webhook/plugin dedicado para leads, pedidos, checkout abandonado y estado de pago.

## Checklist de prueba final con SIM

- Dominio final responde por HTTPS.
- `APP_BASE_URL` apunta al dominio final.
- Webhook URL en el asistente usa el dominio final.
- MongoDB activo en `/api/health`.
- `MAGNET_SEND_REAL_WHATSAPP=true`.
- Token permanente guardado y descifrable.
- Webhook GET de Meta devuelve el challenge exacto.
- Webhook POST de mensaje entrante devuelve `200`.
- No se crean duplicados si se repite el mismo payload.
- El mensaje outbound queda `sent` con id real de Meta.
- Si Meta rechaza el envio, el error queda visible en logs/eventos.

## Referencias primarias

- Meta WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/
- Meta WhatsApp Cloud API messages: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
- Meta Webhooks: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- Meta WhatsApp Webhooks: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
