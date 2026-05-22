# MAGNET Roadmap

## Fase 0 - Base publica y despliegue

Estado: completada.

- Dominio `magnetcloud.app` adquirido y verificado.
- SSL activo para `magnetcloud.app` y `app.magnetcloud.app`.
- Cloud Run definido como deploy unico del producto.
- Landing publicada en `magnetcloud.app`.
- Panel protegido publicado en `app.magnetcloud.app`.
- Repo local corregido para trabajar dentro del proyecto.

## Fase 1 - Autenticacion, seguridad y cuentas

Estado: en progreso avanzado.

- Registro con email y contrasena.
- Login con email y contrasena.
- Login/registro con Google configurado con Google Identity Services.
- 100 mensajes gratis al primer registro.
- Separacion por organizacion.
- Panel admin protegido por rol.
- Sesiones con JWT.
- Proximo: endurecer cookies/sesiones, expiracion/refresh y recuperacion de contrasena.

## Fase 2 - Creditos y pagos

Estado: en progreso.

- Paquetes definidos: 500, 1000, 2000 y 5000 mensajes.
- Backend listo para crear preferencias de Mercado Pago cuando exista `MERCADO_PAGO_ACCESS_TOKEN`.
- UI de compra conectada a `/api/billing/checkout`.
- Webhook base creado en `/api/billing/mercadopago/webhook`.
- Proximo: configurar credenciales de Mercado Pago, validar pagos aprobados y acreditar mensajes automaticamente.

## Fase 3 - WhatsApp Cloud API

Estado: en preparacion de primera prueba real.

- Ajustes por asistente ya guardan ID de numero de telefono, WABA ID, App ID, token permanente y webhook.
- Webhook validado desde Meta Developers.
- Canal `messages` debe permanecer suscrito en Meta.
- Token y Phone Number ID validados contra Meta Graph.
- Envio real activado en Cloud Run con `MAGNET_SEND_REAL_WHATSAPP=true`.
- El backend registra leads entrantes, genera respuesta IA, descuenta creditos y guarda estados de envio/lectura cuando Meta los notifica.
- Proximo: enviar el primer WhatsApp desde otro celular y revisar contacto, conversacion, respuesta y creditos.

## Fase 3.5 - Experiencia de chat y operacion

Estado: en progreso.

- Panel de chat con etiquetas visibles, estado Bot/Humano, indicador de mensajes no leidos, doble check de salida y alerta de error.
- Ejemplos iniciales de etiquetas, plantillas y disparadores para que el usuario aprenda el flujo.
- Proximo: filtros funcionales, asignacion humana, notas internas, cierre/reapertura de conversacion y gestion visual de errores.

## Fase 4 - WooCommerce / WordPress

Estado: pendiente.

- Proximo: conectar API de WooCommerce/WordPress.
- Importar productos con nombre, descripcion y estado de entrenamiento.
- Campo manual de inventario disponible por producto.
- Usar productos seleccionados como contexto de entrenamiento.

## Fase 5 - Produccion comercial

Estado: pendiente.

- Completar politicas de privacidad y terminos legales definitivos.
- Configurar dominio/politicas en Meta Developers.
- Endurecer MongoDB Atlas y mover secretos sensibles a Secret Manager.
- Activar Mercado Pago en produccion.
- Monitoreo, logs y alertas.
