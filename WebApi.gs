function doGet() {
  return jsonResponse_(200, {
    ok: true,
    service: "rut-cleaner-admin-api",
    ts: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    const body = parseJsonBody_(e);
    validateAdminToken_(body);

    const action = String(body.action || "").trim().toLowerCase();
    let result = null;

    if (action === "upsert_user_license") {
      result = adminUpsertUserLicense(body.email, {
        planId: body.planId,
        validDays: body.validDays,
        expiresAt: body.expiresAt,
        monthlyRowsLimit: body.monthlyRowsLimit,
        eventId: body.eventId,
        eventCreatedAt: body.eventCreatedAt,
        eventCreated: body.eventCreated,
      });
    } else if (action === "upsert_domain_license") {
      result = adminUpsertDomainLicense(body.domain, {
        planId: body.planId,
        validDays: body.validDays,
        expiresAt: body.expiresAt,
        monthlyRowsLimit: body.monthlyRowsLimit,
        eventId: body.eventId,
        eventCreatedAt: body.eventCreatedAt,
        eventCreated: body.eventCreated,
      });
    } else if (action === "revoke_user_license") {
      result = adminRevokeUserLicenseWithContext(body.email, {
        eventId: body.eventId,
        eventCreatedAt: body.eventCreatedAt,
        eventCreated: body.eventCreated,
      });
    } else if (action === "revoke_domain_license") {
      result = adminRevokeDomainLicenseWithContext(body.domain, {
        eventId: body.eventId,
        eventCreatedAt: body.eventCreatedAt,
        eventCreated: body.eventCreated,
      });
    } else if (action === "set_upgrade_url") {
      result = adminSetUpgradeUrl(body.url);
    } else if (action === "snapshot") {
      result = adminGetLicensesSnapshot();
    } else {
      return jsonResponse_(400, {
        ok: false,
        error: "accion_no_soportada",
        action,
      });
    }

    logEvent_("admin_api_action", {
      action,
      ok: true,
    });

    return jsonResponse_(200, {
      ok: true,
      action,
      result,
    });
  } catch (error) {
    const message = String((error && error.message) || error);
    logEvent_("admin_api_error", {
      ok: false,
      error: message,
    });

    return jsonResponse_(500, {
      ok: false,
      error: message,
    });
  }
}

function validateAdminToken_(body) {
  const configured = PropertiesService.getScriptProperties().getProperty("rutCleaner.v1.adminApiToken");
  const provided = body && body.apiToken ? String(body.apiToken) : "";

  if (!configured || !String(configured).trim()) {
    throw new Error("Admin API token no configurado en Script Properties.");
  }

  if (!provided || provided !== String(configured)) {
    throw new Error("Token invalido.");
  }
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Body JSON requerido.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("JSON invalido en request.");
  }
}

function jsonResponse_(statusCode, data) {
  const output = ContentService.createTextOutput(
    JSON.stringify({
      statusCode,
      ...data,
    })
  );
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
