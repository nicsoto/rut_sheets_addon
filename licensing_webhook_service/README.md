# Licensing Webhook Service

Microservicio para recibir eventos de Stripe y aprovisionar licencias Pro en el add-on.

## Requisitos

1. Node 18+.
2. Cuenta Stripe.
3. Web App de Apps Script desplegada con endpoint admin activo.

## Configuracion

1. Copia `.env.example` a `.env`.
2. Completa variables requeridas.
3. Instala dependencias con `npm install`.

Atajo: ejecuta `scripts/bootstrap_local.fish` para crear `.env` y generar token admin.

## Ejecucion local

1. `npm run dev`
2. Expone puerto con Stripe CLI o ngrok.
3. Configura webhook de Stripe apuntando a `/webhook/stripe`.

## Deploy recomendado

Revisa `DEPLOY_CLOUD_RUN.md` para desplegar en Cloud Run con un solo comando.

## Variables importantes

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APPS_SCRIPT_ADMIN_URL`
- `APPS_SCRIPT_ADMIN_TOKEN`
- `DEFAULT_VALID_DAYS`
- `DEFAULT_PLAN_ID`
- `DEFAULT_MONTHLY_ROWS_LIMIT`
- `PRICE_CONFIG_JSON`
- `ENABLE_EVENT_DEDUPE`
- `EVENT_DEDUPE_TTL_SECONDS`

## Eventos Stripe soportados

1. `checkout.session.completed` -> crea/actualiza licencia.
2. `invoice.paid` -> renueva licencia con expiracion de periodo cuando sea posible.
3. `customer.subscription.deleted` -> revoca licencia.

El servicio prioriza `expiresAt` exacto cuando puede derivarlo del evento o de la suscripcion.
Tambien envia `eventId` y `eventCreatedAt` al API admin para evitar aplicar eventos duplicados o atrasados.

## Mapeo opcional por precio

Puedes mapear `price_id` de Stripe a limites/plan con `PRICE_CONFIG_JSON`.

Ejemplo:

```json
{
	"price_basic": { "planId": "PRO", "monthlyRowsLimit": 50000 },
	"price_unlimited": { "planId": "PRO", "monthlyRowsLimit": null }
}
```

## Metadata recomendada en Checkout Session

1. `domain` opcional para licencia de dominio.
2. `validDays` opcional para duracion licencia.
3. `monthlyRowsLimit` opcional para planes con limite.

Si no envias `domain`, el webhook intenta crear licencia por email del comprador.
