function getPlanSummaryForSidebar_() {
  const entitlement = getEffectiveEntitlement_();
  return {
    planId: entitlement.planId,
    source: entitlement.source,
    isPro: entitlement.isPro,
    monthlyRowsLimit: entitlement.monthlyRowsLimit,
    rowsUsed: entitlement.rowsUsed,
    rowsRemaining: entitlement.rowsRemaining,
    periodKey: entitlement.periodKey,
    trialEndsAt: entitlement.trialEndsAt,
    upgradeUrl: entitlement.upgradeUrl,
  };
}

function getEffectiveEntitlement_() {
  const now = new Date();
  const periodKey = getUsagePeriodKey_(now);
  const rowsUsed = getUsageRows_(periodKey);
  const identity = getCurrentUserIdentity_();

  const directLicense = getUserLicense_(identity.email);
  if (directLicense && isLicenseActive_(directLicense, now)) {
    return buildEntitlementFromLicense_(directLicense, rowsUsed, periodKey, "user_license");
  }

  const domainLicense = getDomainLicense_(identity.domain);
  if (domainLicense && isLicenseActive_(domainLicense, now)) {
    return buildEntitlementFromLicense_(domainLicense, rowsUsed, periodKey, "domain_license");
  }

  const trialEntitlement = getTrialEntitlement_(now, rowsUsed, periodKey);
  if (trialEntitlement) {
    return trialEntitlement;
  }

  const freeLimit = getFreeMonthlyRowsLimit_();
  return {
    planId: PLAN_ID.FREE,
    source: "default_free",
    isPro: false,
    monthlyRowsLimit: freeLimit,
    rowsUsed,
    rowsRemaining: Math.max(0, freeLimit - rowsUsed),
    periodKey,
    trialEndsAt: "",
    upgradeUrl: getUpgradeUrl_(),
  };
}

function buildEntitlementFromLicense_(license, rowsUsed, periodKey, source) {
  const normalized = normalizeLicenseRecord_(license);
  const hasUnlimitedRows = !Number.isFinite(normalized.monthlyRowsLimit);
  const rowsRemaining = hasUnlimitedRows
    ? Number.POSITIVE_INFINITY
    : Math.max(0, normalized.monthlyRowsLimit - rowsUsed);

  return {
    planId: normalized.planId,
    source,
    isPro: normalized.planId === PLAN_ID.PRO,
    monthlyRowsLimit: hasUnlimitedRows ? null : normalized.monthlyRowsLimit,
    rowsUsed,
    rowsRemaining,
    periodKey,
    trialEndsAt: "",
    upgradeUrl: getUpgradeUrl_(),
  };
}

function getTrialEntitlement_(now, rowsUsed, periodKey) {
  const trialDays = getTrialDays_();
  if (trialDays <= 0) {
    return null;
  }

  const userProps = PropertiesService.getUserProperties();
  let firstSeenAt = userProps.getProperty(USER_FIRST_SEEN_PROPERTY_KEY);
  if (!firstSeenAt) {
    firstSeenAt = now.toISOString();
    userProps.setProperty(USER_FIRST_SEEN_PROPERTY_KEY, firstSeenAt);
  }

  const firstSeenDate = new Date(firstSeenAt);
  if (Number.isNaN(firstSeenDate.getTime())) {
    userProps.setProperty(USER_FIRST_SEEN_PROPERTY_KEY, now.toISOString());
    return null;
  }

  const trialEndsAt = new Date(firstSeenDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
  if (trialEndsAt.getTime() < now.getTime()) {
    return null;
  }

  const trialLimit = Math.max(getFreeMonthlyRowsLimit_(), 30000);
  return {
    planId: PLAN_ID.TRIAL,
    source: "auto_trial",
    isPro: false,
    monthlyRowsLimit: trialLimit,
    rowsUsed,
    rowsRemaining: Math.max(0, trialLimit - rowsUsed),
    periodKey,
    trialEndsAt: trialEndsAt.toISOString(),
    upgradeUrl: getUpgradeUrl_(),
  };
}

function incrementUsageRows_(periodKey, rowsToAdd) {
  if (!rowsToAdd || rowsToAdd <= 0) {
    return;
  }

  const lock = LockService.getUserLock();
  const acquired = lock.tryLock(5000);
  if (!acquired) {
    throw new Error("No se pudo bloquear uso del usuario para actualizar cuota.");
  }

  try {
    const userProps = PropertiesService.getUserProperties();
    const usageKey = USER_USAGE_PREFIX + periodKey;
    const currentRaw = userProps.getProperty(usageKey);
    const currentUsage = Number(currentRaw || 0);
    const safeCurrent = Number.isFinite(currentUsage) ? currentUsage : 0;
    const nextUsage = safeCurrent + rowsToAdd;
    userProps.setProperty(usageKey, String(nextUsage));
  } finally {
    lock.releaseLock();
  }
}

function getUsageRows_(periodKey) {
  const usageKey = USER_USAGE_PREFIX + periodKey;
  const raw = PropertiesService.getUserProperties().getProperty(usageKey);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function getUsagePeriodKey_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return year + "-" + month;
}

function getCurrentUserIdentity_() {
  const activeUser = Session.getActiveUser();
  const email = activeUser ? String(activeUser.getEmail() || "").trim().toLowerCase() : "";
  const temporaryKey = String(Session.getTemporaryActiveUserKey() || "");
  const domain = extractDomain_(email);

  return {
    email,
    domain,
    temporaryKey,
    identityKey: email || "tmp:" + temporaryKey,
  };
}

function extractDomain_(email) {
  if (!email || email.indexOf("@") === -1) {
    return "";
  }
  return email.split("@")[1].toLowerCase();
}

function getUserLicense_(email) {
  if (!email) {
    return null;
  }
  const map = loadJsonScriptProperty_(LICENSES_PROPERTY_KEY, {});
  return map[email] || null;
}

function getDomainLicense_(domain) {
  if (!domain) {
    return null;
  }
  const map = loadJsonScriptProperty_(DOMAIN_LICENSES_PROPERTY_KEY, {});
  return map[domain] || null;
}

function normalizeLicenseRecord_(record) {
  const planId = normalizePlanId_(record && record.planId);
  const expiresAt = record && record.expiresAt ? String(record.expiresAt) : "";
  let monthlyRowsLimit = null;

  if (record && record.monthlyRowsLimit !== undefined && record.monthlyRowsLimit !== null) {
    const parsedLimit = Number(record.monthlyRowsLimit);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      monthlyRowsLimit = Math.floor(parsedLimit);
    }
  }

  return {
    planId,
    expiresAt,
    monthlyRowsLimit,
  };
}

function normalizePlanId_(planId) {
  const safe = String(planId || "").trim().toUpperCase();
  if (safe === PLAN_ID.PRO || safe === PLAN_ID.TRIAL || safe === PLAN_ID.FREE) {
    return safe;
  }
  return PLAN_ID.FREE;
}

function isLicenseActive_(license, now) {
  if (!license || !license.expiresAt) {
    return true;
  }
  const end = new Date(license.expiresAt);
  if (Number.isNaN(end.getTime())) {
    return false;
  }
  return end.getTime() >= now.getTime();
}

function getUpgradeUrl_() {
  const customUrl = PropertiesService.getScriptProperties().getProperty(UPGRADE_URL_PROPERTY_KEY);
  if (customUrl && String(customUrl).trim()) {
    return String(customUrl).trim();
  }
  return DEFAULT_UPGRADE_URL;
}

function getFreeMonthlyRowsLimit_() {
  return getScriptNumberSetting_(FREE_LIMIT_PROPERTY_KEY, DEFAULT_FREE_MONTHLY_ROWS, 1, 5000000);
}

function getTrialDays_() {
  return getScriptNumberSetting_(TRIAL_DAYS_PROPERTY_KEY, DEFAULT_TRIAL_DAYS, 0, 60);
}

function getScriptNumberSetting_(key, fallbackValue, minValue, maxValue) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  const floored = Math.floor(parsed);
  if (floored < minValue) {
    return minValue;
  }
  if (floored > maxValue) {
    return maxValue;
  }
  return floored;
}

function loadJsonScriptProperty_(key, fallbackValue) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) {
    return fallbackValue;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return fallbackValue;
    }
    return parsed;
  } catch (error) {
    logEvent_("config_json_parse_failed", {
      key,
      error: String(error.message || error),
    });
    return fallbackValue;
  }
}

function saveJsonScriptProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value));
}

function adminUpsertUserLicense(email, options) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.indexOf("@") === -1) {
    throw new Error("Debes enviar un email valido.");
  }

  const licenses = loadJsonScriptProperty_(LICENSES_PROPERTY_KEY, {});
  const currentRecord = licenses[normalizedEmail] || null;
  const guard = shouldApplyLicenseMutation_(currentRecord, options);
  if (!guard.apply) {
    return {
      email: normalizedEmail,
      applied: false,
      skippedReason: guard.reason,
      current: currentRecord,
    };
  }

  licenses[normalizedEmail] = buildLicenseRecordFromOptions_(options);
  saveJsonScriptProperty_(LICENSES_PROPERTY_KEY, licenses);

  return {
    email: normalizedEmail,
    applied: true,
    ...licenses[normalizedEmail],
  };
}

function adminUpsertDomainLicense(domain, options) {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  if (!normalizedDomain || normalizedDomain.indexOf(".") === -1) {
    throw new Error("Debes enviar un dominio valido (ej: empresa.cl).");
  }

  const licenses = loadJsonScriptProperty_(DOMAIN_LICENSES_PROPERTY_KEY, {});
  const currentRecord = licenses[normalizedDomain] || null;
  const guard = shouldApplyLicenseMutation_(currentRecord, options);
  if (!guard.apply) {
    return {
      domain: normalizedDomain,
      applied: false,
      skippedReason: guard.reason,
      current: currentRecord,
    };
  }

  licenses[normalizedDomain] = buildLicenseRecordFromOptions_(options);
  saveJsonScriptProperty_(DOMAIN_LICENSES_PROPERTY_KEY, licenses);

  return {
    domain: normalizedDomain,
    applied: true,
    ...licenses[normalizedDomain],
  };
}

function buildLicenseRecordFromOptions_(options) {
  const safeOptions = options && typeof options === "object" ? options : {};

  const planId = normalizePlanId_(safeOptions.planId || PLAN_ID.PRO);
  const monthlyRowsLimit = normalizeNullableLimit_(safeOptions.monthlyRowsLimit);
  const expiresAt = resolveLicenseExpiresAt_(safeOptions);
  const eventInfo = extractEventInfo_(safeOptions);

  return {
    planId,
    expiresAt,
    monthlyRowsLimit,
    lastEventId: eventInfo.eventId,
    lastEventCreatedAt: eventInfo.eventCreatedAt,
  };
}

function shouldApplyLicenseMutation_(currentRecord, options) {
  if (!currentRecord) {
    return { apply: true, reason: "new_record" };
  }

  const incomingEvent = extractEventInfo_(options);
  if (!incomingEvent.eventCreatedAt) {
    return { apply: true, reason: "no_event_context" };
  }

  const incomingMs = Date.parse(incomingEvent.eventCreatedAt);
  if (Number.isNaN(incomingMs)) {
    return { apply: true, reason: "invalid_incoming_event_ts" };
  }

  const currentEventTs = currentRecord.lastEventCreatedAt ? Date.parse(String(currentRecord.lastEventCreatedAt)) : NaN;
  if (!Number.isNaN(currentEventTs) && incomingMs < currentEventTs) {
    return { apply: false, reason: "stale_event" };
  }

  if (!Number.isNaN(currentEventTs) && incomingMs === currentEventTs) {
    const incomingEventId = incomingEvent.eventId || "";
    const currentEventId = String(currentRecord.lastEventId || "");
    if (incomingEventId && currentEventId && incomingEventId === currentEventId) {
      return { apply: false, reason: "duplicate_event" };
    }
  }

  return { apply: true, reason: "newer_or_unknown_event" };
}

function extractEventInfo_(options) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const eventId = safeOptions.eventId ? String(safeOptions.eventId) : "";

  let eventCreatedAt = "";
  if (safeOptions.eventCreatedAt) {
    const parsedIso = new Date(String(safeOptions.eventCreatedAt));
    if (!Number.isNaN(parsedIso.getTime())) {
      eventCreatedAt = parsedIso.toISOString();
    }
  } else if (safeOptions.eventCreated) {
    const parsedSeconds = Number(safeOptions.eventCreated);
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      eventCreatedAt = new Date(parsedSeconds * 1000).toISOString();
    }
  }

  return {
    eventId,
    eventCreatedAt,
  };
}

function resolveLicenseExpiresAt_(options) {
  if (options && options.expiresAt) {
    const parsed = new Date(String(options.expiresAt));
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("expiresAt invalido. Usa formato ISO-8601.");
    }
    return parsed.toISOString();
  }

  const days = Number.isFinite(Number(options && options.validDays))
    ? Math.max(1, Math.floor(Number(options.validDays)))
    : 365;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function adminGrantProToEmail(email, validDays, monthlyRowsLimit) {
  return adminUpsertUserLicense(email, {
    planId: PLAN_ID.PRO,
    validDays,
    monthlyRowsLimit,
  });
}

function adminGrantProToDomain(domain, validDays, monthlyRowsLimit) {
  return adminUpsertDomainLicense(domain, {
    planId: PLAN_ID.PRO,
    validDays,
    monthlyRowsLimit,
  });
}

function adminRevokeUserLicense(email) {
  return adminRevokeUserLicenseWithContext(email, {});
}

function adminRevokeUserLicenseWithContext(email, options) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const licenses = loadJsonScriptProperty_(LICENSES_PROPERTY_KEY, {});

  const currentRecord = licenses[normalizedEmail] || null;
  if (!currentRecord) {
    return {
      email: normalizedEmail,
      revoked: false,
      skippedReason: "not_found",
    };
  }

  const guard = shouldApplyLicenseMutation_(currentRecord, options);
  if (!guard.apply) {
    return {
      email: normalizedEmail,
      revoked: false,
      skippedReason: guard.reason,
      current: currentRecord,
    };
  }

  delete licenses[normalizedEmail];
  saveJsonScriptProperty_(LICENSES_PROPERTY_KEY, licenses);
  return {
    email: normalizedEmail,
    revoked: true,
  };
}

function adminRevokeDomainLicense(domain) {
  return adminRevokeDomainLicenseWithContext(domain, {});
}

function adminRevokeDomainLicenseWithContext(domain, options) {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const licenses = loadJsonScriptProperty_(DOMAIN_LICENSES_PROPERTY_KEY, {});

  const currentRecord = licenses[normalizedDomain] || null;
  if (!currentRecord) {
    return {
      domain: normalizedDomain,
      revoked: false,
      skippedReason: "not_found",
    };
  }

  const guard = shouldApplyLicenseMutation_(currentRecord, options);
  if (!guard.apply) {
    return {
      domain: normalizedDomain,
      revoked: false,
      skippedReason: guard.reason,
      current: currentRecord,
    };
  }

  delete licenses[normalizedDomain];
  saveJsonScriptProperty_(DOMAIN_LICENSES_PROPERTY_KEY, licenses);
  return {
    domain: normalizedDomain,
    revoked: true,
  };
}

function adminSetUpgradeUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    throw new Error("Debes enviar una URL valida.");
  }

  PropertiesService.getScriptProperties().setProperty(UPGRADE_URL_PROPERTY_KEY, normalized);
  return {
    upgradeUrl: normalized,
  };
}

function adminSetFreeMonthlyLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("El limite mensual debe ser un numero mayor a 0.");
  }

  const normalized = Math.floor(parsed);
  PropertiesService.getScriptProperties().setProperty(FREE_LIMIT_PROPERTY_KEY, String(normalized));
  return {
    freeMonthlyRowsLimit: normalized,
  };
}

function adminSetTrialDays(days) {
  const parsed = Number(days);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Los dias de trial deben ser un numero mayor o igual a 0.");
  }

  const normalized = Math.floor(parsed);
  PropertiesService.getScriptProperties().setProperty(TRIAL_DAYS_PROPERTY_KEY, String(normalized));
  return {
    trialDays: normalized,
  };
}

function adminResetMyCurrentMonthUsage() {
  const periodKey = getUsagePeriodKey_(new Date());
  PropertiesService.getUserProperties().deleteProperty(USER_USAGE_PREFIX + periodKey);
  return {
    periodKey,
    reset: true,
  };
}

function adminGetLicensesSnapshot() {
  return {
    byUser: loadJsonScriptProperty_(LICENSES_PROPERTY_KEY, {}),
    byDomain: loadJsonScriptProperty_(DOMAIN_LICENSES_PROPERTY_KEY, {}),
    upgradeUrl: getUpgradeUrl_(),
    freeMonthlyRowsLimit: getFreeMonthlyRowsLimit_(),
    trialDays: getTrialDays_(),
  };
}

function normalizeNullableLimit_(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}
