# Deploy to Cloud Run

## 1) Prerrequisitos

1. Google Cloud project con facturacion activa.
2. API de Cloud Run y Artifact Registry habilitadas.
3. gcloud CLI autenticado.

## 2) Build y deploy rapido

Desde esta carpeta:

```bash
gcloud run deploy rut-cleaner-licensing-webhook \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars STRIPE_SECRET_KEY=sk_live_xxx \
  --set-env-vars STRIPE_WEBHOOK_SECRET=whsec_xxx \
  --set-env-vars APPS_SCRIPT_ADMIN_URL=https://script.google.com/macros/s/XXX/exec \
  --set-env-vars APPS_SCRIPT_ADMIN_TOKEN=token_largo_aleatorio \
  --set-env-vars DEFAULT_VALID_DAYS=30 \
  --set-env-vars DEFAULT_PLAN_ID=PRO \
  --set-env-vars PRICE_CONFIG_JSON='{"price_123":{"planId":"PRO","monthlyRowsLimit":null}}' \
  --set-env-vars ENABLE_EVENT_DEDUPE=true \
  --set-env-vars EVENT_DEDUPE_TTL_SECONDS=86400
```

## 3) Configurar webhook en Stripe

1. URL webhook: `https://<tu-servicio>.run.app/webhook/stripe`
2. Eventos:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
3. Copia `Signing secret` de Stripe y actualiza `STRIPE_WEBHOOK_SECRET`.

## 4) Health check

Verifica:

```bash
curl https://<tu-servicio>.run.app/health
```

Esperado:

```json
{"ok":true,"service":"rut-cleaner-licensing-webhook"}
```

## 5) Recomendaciones

1. Restringe ingress si usas un gateway o capa de seguridad adicional.
2. Usa Secret Manager para credenciales en vez de env vars directas.
3. Activa alertas por errores 5xx en Cloud Monitoring.
