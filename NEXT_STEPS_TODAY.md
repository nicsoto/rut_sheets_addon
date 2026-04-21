# Next Steps Today (30-60 min)

## 1) Apps Script: set Script Properties

Set:

1. `rutCleaner.v1.upgradeUrl`
2. `rutCleaner.v1.freeMonthlyRowLimit`
3. `rutCleaner.v1.trialDays`
4. `rutCleaner.v1.adminApiToken`
5. `rutCleaner.v1.logToSheet` (optional)

## 2) Deploy Web API from Apps Script

1. Deploy > New deployment
2. Type: Web app
3. Execute as: your account
4. Access: Anyone with the link
5. Copy URL (`APPS_SCRIPT_ADMIN_URL`)

## 3) Configure webhook service env

In `licensing_webhook_service/.env` set:

1. `STRIPE_SECRET_KEY`
2. `STRIPE_WEBHOOK_SECRET`
3. `APPS_SCRIPT_ADMIN_URL`
4. `APPS_SCRIPT_ADMIN_TOKEN`
5. Optional: `PRICE_CONFIG_JSON`

## 4) Run webhook service

```bash
cd licensing_webhook_service
npm install
npm run dev
```

## 5) Stripe webhook

1. Endpoint: `https://<tu-dominio>/webhook/stripe`
2. Subscribe events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`

## 6) Validate full flow

1. Grant manual Pro once from Apps Script (sanity):
   - `adminGrantProToEmail("tu@email.com", 30, null)`
2. Open sheet sidebar and confirm plan changes.
3. Trigger Stripe test event and confirm webhook logs + plan mutation.

## 7) Publish prep

1. Complete legal URLs from templates.
2. Finalize listing copy.
3. Run checklist and submit Marketplace review.
