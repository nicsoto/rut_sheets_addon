require("dotenv").config();

const express = require("express");
const Stripe = require("stripe");

const app = express();

const PORT = Number(process.env.PORT || 8080);
const stripeSecret = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const appsScriptAdminUrl = String(process.env.APPS_SCRIPT_ADMIN_URL || "").trim();
const appsScriptAdminToken = String(process.env.APPS_SCRIPT_ADMIN_TOKEN || "").trim();
const defaultValidDays = Number(process.env.DEFAULT_VALID_DAYS || 30);
const defaultPlanId = String(process.env.DEFAULT_PLAN_ID || "PRO").trim().toUpperCase();
const defaultMonthlyRowsLimit = parseNullableLimitValue_(process.env.DEFAULT_MONTHLY_ROWS_LIMIT);
const priceConfigById = parsePriceConfig_(process.env.PRICE_CONFIG_JSON || "");
const dedupeEnabled = normalizeBoolean_(process.env.ENABLE_EVENT_DEDUPE, true);
const dedupeTtlMs = normalizeInteger(process.env.EVENT_DEDUPE_TTL_SECONDS, 24 * 60 * 60) * 1000;
const processedEvents = new Map();

if (!stripeSecret || !stripeWebhookSecret || !appsScriptAdminUrl || !appsScriptAdminToken) {
  console.error("Missing required environment variables. Check .env file.");
  process.exit(1);
}

const stripe = new Stripe(stripeSecret);

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "rut-cleaner-licensing-webhook" });
});

app.post("/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({ ok: false, error: "missing_stripe_signature" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
  } catch (error) {
    return res.status(400).json({ ok: false, error: "invalid_signature", detail: error.message });
  }

  if (dedupeEnabled && isDuplicateEvent_(event.id)) {
    return res.status(200).json({ ok: true, handled: { eventType: event.type, action: "duplicate_ignored" } });
  }

  try {
    const handled = await handleStripeEvent(event);
    if (dedupeEnabled) {
      rememberProcessedEvent_(event.id);
    }
    return res.status(200).json({ ok: true, handled });
  } catch (error) {
    console.error("Webhook processing failed", error);
    return res.status(500).json({ ok: false, error: "webhook_processing_failed", detail: error.message });
  }
});

async function handleStripeEvent(event) {
  if (event.type === "checkout.session.completed") {
    return handleCheckoutSessionCompleted_(event);
  }

  if (event.type === "invoice.paid") {
    return handleInvoicePaid_(event);
  }

  if (event.type === "customer.subscription.deleted") {
    return handleSubscriptionDeleted_(event);
  }

  return { eventType: event.type, action: "ignored" };
}

async function handleCheckoutSessionCompleted_(event) {
  const data = event.data && event.data.object ? event.data.object : {};
  const metadata = data.metadata || {};
  const eventContext = getEventContext_(event);
  const target = await resolveProvisioningTarget_({ data, metadata });
  const pricing = await resolvePricingContext_({ data, metadata });
  const expiresAt = await resolveExpiresAtIso_({
    data,
    metadata,
    fallbackSubscriptionId: data.subscription,
  });
  const validDays = normalizeInteger(metadata.validDays, defaultValidDays);
  const monthlyRowsLimit = resolveMonthlyRowsLimit_({ metadata, pricing });

  await callAppsScriptAdmin(
    buildUpsertPayload_(target, {
      planId: pricing.planId,
      monthlyRowsLimit,
      expiresAt,
      validDays,
      eventContext,
    })
  );

  return {
    eventType: event.type,
    action: target.type === "domain" ? "upsert_domain_license" : "upsert_user_license",
    target,
    planId: pricing.planId,
    priceId: pricing.priceId,
    expiresAt: expiresAt || null,
    validDays: expiresAt ? null : validDays,
    monthlyRowsLimit,
  };
}

async function handleInvoicePaid_(event) {
  const data = event.data && event.data.object ? event.data.object : {};
  const metadata = data.metadata || {};
  const eventContext = getEventContext_(event);
  const target = await resolveProvisioningTarget_({ data, metadata });
  const pricing = await resolvePricingContext_({ data, metadata });
  const expiresAt = await resolveExpiresAtIso_({
    data,
    metadata,
    fallbackSubscriptionId: data.subscription,
  });
  const validDays = normalizeInteger(metadata.validDays, defaultValidDays);
  const monthlyRowsLimit = resolveMonthlyRowsLimit_({ metadata, pricing });

  await callAppsScriptAdmin(
    buildUpsertPayload_(target, {
      planId: pricing.planId,
      monthlyRowsLimit,
      expiresAt,
      validDays,
      eventContext,
    })
  );

  return {
    eventType: event.type,
    action: target.type === "domain" ? "upsert_domain_license" : "upsert_user_license",
    target,
    planId: pricing.planId,
    priceId: pricing.priceId,
    expiresAt: expiresAt || null,
    validDays: expiresAt ? null : validDays,
    monthlyRowsLimit,
  };
}

async function handleSubscriptionDeleted_(event) {
  const data = event.data && event.data.object ? event.data.object : {};
  const metadata = data.metadata || {};
  const eventContext = getEventContext_(event);
  const target = await resolveProvisioningTarget_({ data, metadata, allowDomainFallback: true });

  if (target.type === "domain") {
    await callAppsScriptAdmin({
      action: "revoke_domain_license",
      domain: target.domain,
      eventId: eventContext.eventId,
      eventCreatedAt: eventContext.eventCreatedAt,
    });

    return {
      eventType: event.type,
      action: "revoke_domain_license",
      target,
    };
  }

  await callAppsScriptAdmin({
    action: "revoke_user_license",
    email: target.email,
    eventId: eventContext.eventId,
    eventCreatedAt: eventContext.eventCreatedAt,
  });

  return {
    eventType: event.type,
    action: "revoke_user_license",
    target,
  };
}

function buildUpsertPayload_(target, options) {
  const payload = {
    action: target.type === "domain" ? "upsert_domain_license" : "upsert_user_license",
    planId: options.planId,
    monthlyRowsLimit: options.monthlyRowsLimit,
    eventId: options.eventContext ? options.eventContext.eventId : "",
    eventCreatedAt: options.eventContext ? options.eventContext.eventCreatedAt : "",
  };

  if (target.type === "domain") {
    payload.domain = target.domain;
  } else {
    payload.email = target.email;
  }

  if (options.expiresAt) {
    payload.expiresAt = options.expiresAt;
  } else {
    payload.validDays = options.validDays;
  }

  return payload;
}

function getEventContext_(event) {
  const eventId = event && event.id ? String(event.id) : "";
  const createdSeconds = event && Number.isFinite(Number(event.created)) ? Number(event.created) : 0;
  const eventCreatedAt = createdSeconds > 0 ? new Date(createdSeconds * 1000).toISOString() : "";

  return {
    eventId,
    eventCreatedAt,
  };
}

async function resolveProvisioningTarget_({ data, metadata, allowDomainFallback }) {
  const domain = String(metadata.domain || "").trim().toLowerCase();
  if (domain) {
    return { type: "domain", domain };
  }

  const metadataEmail = String(metadata.email || "").trim().toLowerCase();
  if (metadataEmail) {
    return { type: "user", email: metadataEmail };
  }

  const email = getCandidateEmail(data);
  if (email) {
    return { type: "user", email };
  }

  const customerId = data && typeof data.customer === "string" ? data.customer : "";
  const customerEmail = customerId ? await getCustomerEmail_(customerId) : "";
  if (customerEmail) {
    return { type: "user", email: customerEmail };
  }

  if (allowDomainFallback && domain) {
    return { type: "domain", domain };
  }

  throw new Error("No email or domain found in Stripe payload metadata.");
}

async function resolvePricingContext_({ data, metadata }) {
  const metadataPriceId = String(metadata.priceId || "").trim();
  const invoicePriceId = extractPriceIdFromInvoice_(data);
  const subscriptionPriceId = metadataPriceId || invoicePriceId ? "" : await extractPriceIdFromSubscription_(data);

  const priceId = metadataPriceId || invoicePriceId || subscriptionPriceId || "";
  const mapped = priceId && priceConfigById[priceId] ? priceConfigById[priceId] : null;

  return {
    priceId: priceId || null,
    planId: mapped && mapped.planId ? String(mapped.planId).trim().toUpperCase() : defaultPlanId,
    monthlyRowsLimit:
      mapped && Object.prototype.hasOwnProperty.call(mapped, "monthlyRowsLimit")
        ? parseNullableLimitValue_(mapped.monthlyRowsLimit)
        : defaultMonthlyRowsLimit,
  };
}

function resolveMonthlyRowsLimit_({ metadata, pricing }) {
  const fromMetadata = normalizeNullableLimit(metadata.monthlyRowsLimit);
  if (fromMetadata !== null) {
    return fromMetadata;
  }

  if (pricing && Object.prototype.hasOwnProperty.call(pricing, "monthlyRowsLimit")) {
    return pricing.monthlyRowsLimit;
  }

  return defaultMonthlyRowsLimit;
}

async function resolveExpiresAtIso_({ data, metadata, fallbackSubscriptionId }) {
  if (metadata && metadata.expiresAt) {
    const parsed = new Date(String(metadata.expiresAt));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const invoicePeriodEnd = extractInvoicePeriodEnd_(data);
  if (invoicePeriodEnd) {
    return new Date(invoicePeriodEnd * 1000).toISOString();
  }

  const subscriptionId =
    data && typeof data.subscription === "string" ? data.subscription : String(fallbackSubscriptionId || "");
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription && subscription.current_period_end) {
      return new Date(subscription.current_period_end * 1000).toISOString();
    }
  }

  return "";
}

function extractInvoicePeriodEnd_(data) {
  if (!data || !data.lines || !Array.isArray(data.lines.data) || data.lines.data.length === 0) {
    return null;
  }

  const firstLine = data.lines.data[0];
  if (firstLine && firstLine.period && Number.isFinite(Number(firstLine.period.end))) {
    return Number(firstLine.period.end);
  }

  return null;
}

function extractPriceIdFromInvoice_(data) {
  if (!data || !data.lines || !Array.isArray(data.lines.data) || data.lines.data.length === 0) {
    return "";
  }

  const firstLine = data.lines.data[0];
  if (firstLine && firstLine.price && firstLine.price.id) {
    return String(firstLine.price.id);
  }

  return "";
}

async function extractPriceIdFromSubscription_(data) {
  const subscriptionId = data && typeof data.subscription === "string" ? data.subscription : "";
  if (!subscriptionId) {
    return "";
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const items = subscription && subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  if (items.length === 0 || !items[0].price || !items[0].price.id) {
    return "";
  }

  return String(items[0].price.id);
}

async function getCustomerEmail_(customerId) {
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) {
    return "";
  }

  const email = String(customer.email || "").trim().toLowerCase();
  return email || "";
}

function parsePriceConfig_(raw) {
  if (!raw || !String(raw).trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch (error) {
    console.warn("Invalid PRICE_CONFIG_JSON; ignoring mapping.", error.message);
    return {};
  }
}

function isDuplicateEvent_(eventId) {
  cleanupProcessedEvents_();
  return processedEvents.has(eventId);
}

function rememberProcessedEvent_(eventId) {
  if (!eventId) {
    return;
  }

  processedEvents.set(eventId, Date.now());
  cleanupProcessedEvents_();
}

function cleanupProcessedEvents_() {
  const threshold = Date.now() - dedupeTtlMs;
  for (const [eventId, processedAt] of processedEvents.entries()) {
    if (processedAt < threshold) {
      processedEvents.delete(eventId);
    }
  }
}

function normalizeBoolean_(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getCandidateEmail(data) {
  const fromCustomerDetails = data && data.customer_details ? data.customer_details.email : "";
  const fromCustomerEmail = data ? data.customer_email : "";
  const fromReceiptEmail = data ? data.receipt_email : "";

  const candidate = String(fromCustomerDetails || fromCustomerEmail || fromReceiptEmail || "").trim().toLowerCase();
  return candidate || "";
}

async function callAppsScriptAdmin(payload) {
  const response = await fetch(appsScriptAdminUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiToken: appsScriptAdminToken,
      ...payload,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error("Apps Script admin API failed with status " + response.status + ": " + bodyText);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    throw new Error("Apps Script admin API returned invalid JSON: " + bodyText);
  }

  if (!parsed.ok) {
    throw new Error("Apps Script admin API returned error: " + JSON.stringify(parsed));
  }

  return parsed;
}

function normalizeInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.floor(Number(fallbackValue) || 30));
  }

  return Math.floor(parsed);
}

function normalizeNullableLimit(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultMonthlyRowsLimit;
  }

  return parseNullableLimitValue_(value);
}

function parseNullableLimitValue_(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

app.listen(PORT, () => {
  console.log("rut-cleaner-licensing-webhook listening on port", PORT);
});
