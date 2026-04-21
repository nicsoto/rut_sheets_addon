# Payment Integration Blueprint

Implementacion recomendada para cobrar Pro con Stripe o Paddle y reflejar licencias en el add-on.

## Objetivo

Convertir pagos exitosos en licencias activas dentro de `LICENSES_PROPERTY_KEY` o `DOMAIN_LICENSES_PROPERTY_KEY`.

## Arquitectura minima

1. Checkout externo (Stripe Checkout o Paddle Checkout).
2. Webhook backend (Cloud Run, Railway o similar).
3. Endpoint admin seguro para escribir licencias en Script Properties.

## Flujo sugerido

1. Usuario abre `upgradeUrl` desde sidebar.
2. Usuario paga en checkout.
3. Stripe envia webhook `checkout.session.completed` o `invoice.paid`.
4. Backend valida firma del webhook.
5. Backend llama API admin de Apps Script con `expiresAt` o `validDays`.
6. En siguiente apertura de sidebar, plan pasa a `PRO`.

Para baja/cancelacion, usar `customer.subscription.deleted` y revocar licencia.

## Modelo de datos de licencia

```json
{
  "planId": "PRO",
  "expiresAt": "2027-04-20T23:59:59.000Z",
  "monthlyRowsLimit": null
}
```

## Recomendaciones de seguridad

1. Validar firma webhook siempre.
2. Nunca exponer llaves secretas en Apps Script.
3. Restringir endpoint admin con API key y allowlist IP.
4. Loggear solo metadatos, nunca PAN ni datos sensibles.

## Endpoint recomendado (tu backend)

`POST /licenses/upsert`

Body:

```json
{
  "email": "user@empresa.cl",
  "domain": null,
  "planId": "PRO",
  "expiresAt": "2027-04-20T23:59:59.000Z",
  "eventId": "evt_123",
  "eventCreatedAt": "2026-04-20T12:00:00.000Z",
  "monthlyRowsLimit": null
}
```

Incluye `eventId` y `eventCreatedAt` para que el add-on ignore eventos duplicados o fuera de orden.

## Conexion con Apps Script

Alternativa A (manual inicial): ejecutar `adminGrantProToEmail`.

Alternativa B (automatizada): crear Web App en Apps Script con endpoint firmado que invoque `adminUpsertUserLicense` o `adminUpsertDomainLicense`.

## Estado actual del repo

El add-on ya soporta lectura de licencias por email/dominio y cambio automatico de plan. Solo falta conectar el sistema de cobro real para poblar esas licencias automaticamente.
