function logEvent_(eventName, payload) {
  const now = new Date();
  const entry = {
    ts: now.toISOString(),
    event: String(eventName || "unknown"),
    payload: payload || {},
  };

  console.log(JSON.stringify(entry));

  if (!isSheetLoggingEnabled_()) {
    return;
  }

  try {
    appendLogToSheet_(entry);
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: now.toISOString(),
        event: "log_sheet_append_failed",
        error: String(error.message || error),
      })
    );
  }
}

function isSheetLoggingEnabled_() {
  const raw = PropertiesService.getScriptProperties().getProperty("rutCleaner.v1.logToSheet");
  if (!raw) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function appendLogToSheet_(entry) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
    sheet.hideSheet();
    sheet.getRange(1, 1, 1, 4).setValues([["Timestamp", "Event", "Payload", "User"]]);
  }

  const userEmail = String(Session.getActiveUser().getEmail() || "");
  sheet.appendRow([entry.ts, entry.event, JSON.stringify(entry.payload), userEmail]);
}

function adminEnableSheetLogging(enabled) {
  const normalized = Boolean(enabled);
  PropertiesService.getScriptProperties().setProperty("rutCleaner.v1.logToSheet", normalized ? "true" : "false");
  return {
    sheetLogging: normalized,
  };
}
