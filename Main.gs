const APP_MENU_TITLE = "RUT Cleaner Chile";
const JOB_PROPERTY_KEY = "rutCleaner.v1.currentJob";
const USER_PREFS_KEY = "rutCleaner.v1.userPrefs";
const LICENSES_PROPERTY_KEY = "rutCleaner.v1.licensesByUser";
const DOMAIN_LICENSES_PROPERTY_KEY = "rutCleaner.v1.licensesByDomain";
const UPGRADE_URL_PROPERTY_KEY = "rutCleaner.v1.upgradeUrl";
const FREE_LIMIT_PROPERTY_KEY = "rutCleaner.v1.freeMonthlyRowLimit";
const TRIAL_DAYS_PROPERTY_KEY = "rutCleaner.v1.trialDays";
const USER_FIRST_SEEN_PROPERTY_KEY = "rutCleaner.v1.firstSeenAt";
const USER_USAGE_PREFIX = "rutCleaner.v1.usage.";
const PROCESSING_START_ROW = 2;
const MAX_EXECUTION_MS = 240000;
const DEFAULT_BATCH_SIZE = 500;
const MIN_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 3000;
const OUTPUT_WIDTH = 4;
const DEFAULT_FREE_MONTHLY_ROWS = 10000;
const DEFAULT_TRIAL_DAYS = 7;
const DEFAULT_UPGRADE_URL = "https://example.com/rut-cleaner-pro";
const LOG_SHEET_NAME = "_RUTCLEANER_LOGS";

const PLAN_ID = Object.freeze({
  FREE: "FREE",
  TRIAL: "TRIAL",
  PRO: "PRO",
});

const JOB_STATUS = Object.freeze({
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  LIMIT_REACHED: "LIMIT_REACHED",
  DONE: "DONE",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(APP_MENU_TITLE)
    .addItem("Abrir panel", "showSidebar")
    .addItem("Continuar ultimo proceso", "continueLastJobFromMenu")
    .addItem("Exportar resumen ultimo proceso", "exportLastJobReport")
    .addSeparator()
    .addItem("Crear datos demo (12 filas)", "generateDemoData")
    .addItem("Crear datos carga 1k", "generateLoadTestData1k")
    .addItem("Crear datos carga 10k", "generateLoadTestData10k")
    .addItem("Crear datos carga 50k", "generateLoadTestData50k")
    .addItem("Correr load test completo", "runLoadTestAndReport")
    .addSeparator()
    .addItem("Ejecutar self-test", "runAllSelfTests")
    .addSeparator()
    .addItem("Cancelar proceso", "cancelJobFromMenu")
    .addItem("Limpiar estado de proceso", "clearJobFromMenu")
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("Sidebar").setTitle(APP_MENU_TITLE);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getSidebarState() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = spreadsheet.getSheets().map((sheet) => ({
    name: sheet.getName(),
    id: sheet.getSheetId(),
    lastRow: sheet.getLastRow(),
    maxColumns: sheet.getMaxColumns(),
  }));

  return {
    appName: APP_MENU_TITLE,
    appVersion: "1.1.0",
    sheets,
    activeSheetName: spreadsheet.getActiveSheet().getName(),
    defaults: getUserPrefs_(),
    plan: getPlanSummaryForSidebar_(),
    currentJob: buildJobResponse_(getCurrentJob_()),
  };
}

function startRutJob(payload) {
  return withDocumentLock_(() => {
    logEvent_("job_start_requested", {
      source: "sidebar",
    });

    validateStartPayload_(payload);
    const job = createJobFromPayload_(payload);

    saveUserPrefs_({
      sheetName: job.sheetName,
      inputColumn: columnNumberToLetter_(job.inputColumn),
      outputColumn: columnNumberToLetter_(job.outputColumn),
      batchSize: job.batchSize,
    });

    saveCurrentJob_(job);
    const response = processJobChunk_(job);
    logEvent_("job_started", {
      jobId: job.id,
      planId: job.planId,
      totalRows: job.totalRows,
      requestedRows: job.requestedRows,
    });
    return response;
  });
}

function continueRutJob() {
  return withDocumentLock_(() => {
    const job = getCurrentJob_();
    if (!job) {
      return {
        status: JOB_STATUS.IDLE,
        message: "No hay ningun proceso activo.",
      };
    }

    if (
      job.status === JOB_STATUS.DONE ||
      job.status === JOB_STATUS.CANCELED ||
      job.status === JOB_STATUS.LIMIT_REACHED
    ) {
      return buildJobResponse_(job);
    }

    job.status = JOB_STATUS.RUNNING;
    job.updatedAt = new Date().toISOString();
    saveCurrentJob_(job);
    const response = processJobChunk_(job);
    logEvent_("job_continue", {
      jobId: job.id,
      status: response.status,
      progressPct: response.progressPct,
    });
    return response;
  });
}

function cancelRutJob() {
  return withDocumentLock_(() => {
    const job = getCurrentJob_();
    if (!job) {
      return {
        status: JOB_STATUS.IDLE,
        message: "No hay ningun proceso activo.",
      };
    }

    if (
      job.status === JOB_STATUS.DONE ||
      job.status === JOB_STATUS.CANCELED ||
      job.status === JOB_STATUS.LIMIT_REACHED
    ) {
      return buildJobResponse_(job);
    }

    job.status = JOB_STATUS.CANCELED;
    job.updatedAt = new Date().toISOString();
    job.finishedAt = job.updatedAt;
    saveCurrentJob_(job);
    logEvent_("job_canceled", {
      jobId: job.id,
      processedRows: job.processedRows,
    });
    return buildJobResponse_(job);
  });
}

function getCurrentJobStatus() {
  return buildJobResponse_(getCurrentJob_());
}

function continueLastJobFromMenu() {
  const result = continueRutJob();
  if (result && result.status) {
    SpreadsheetApp.getActive().toast(
      "Estado: " + result.status + " | Progreso: " + (result.progressPct || 0) + "%",
      APP_MENU_TITLE,
      5
    );
  }
}

function cancelJobFromMenu() {
  const result = cancelRutJob();
  SpreadsheetApp.getActive().toast(result.message || "Proceso cancelado.", APP_MENU_TITLE, 5);
}

function clearJobFromMenu() {
  withDocumentLock_(() => {
    clearCurrentJob_();
  });
  SpreadsheetApp.getActive().toast("Estado de proceso limpiado.", APP_MENU_TITLE, 5);
}

function getUpgradeUrl() {
  return getUpgradeUrl_();
}

function runAllSelfTests() {
  const outputs = [];
  outputs.push(runRutEngineSelfTest());
  outputs.push(runJobServiceSelfTest_());

  SpreadsheetApp.getActive().toast("Self-test OK", APP_MENU_TITLE, 4);
  return outputs.join(" | ");
}

function generateDemoData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([["Nombre", "RUT"]]);
  sheet
    .getRange(2, 1, 14, 2)
    .setValues([
      ["Ana", "12.345.678-5"],
      ["Pedro", "76086428-5"],
      ["Marta", "7.617.343-5"],
      ["Luis", "12345678-9"],
      ["Sofia", "11.111.111-1"],
      ["Carlos", "11.111.111-2"],
      ["Claudia", ""],
      ["Diego", "ABC"],
      ["Elena", "00012345-6"],
      ["Pablo", "12 345 678 5"],
      ["Rosa", "76086428K"],
      ["Nicolas", "7.617.343-5"],
      ["Ignacia", "1.000.411-K"],
      ["Tomas", "007617343-5"],
    ]);
  SpreadsheetApp.getActive().toast("Datos demo creados en columnas A-B.", APP_MENU_TITLE, 5);
}

function generateLoadTestData1k() {
  generateLoadTestData_(1000);
}

function generateLoadTestData10k() {
  generateLoadTestData_(10000);
}

function generateLoadTestData50k() {
  generateLoadTestData_(50000);
}

function generateLoadTestData_(rowCount) {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.clear();
  sheet.getRange(1, 1, 1, 2).setValues([["Nombre", "RUT"]]);

  var sampleRuts = [
    "12.345.678-5",
    "76086428-5",
    "7.617.343-5",
    "12345678-9",
    "11.111.111-1",
    "11.111.111-2",
    "",
    "ABC",
    "00012345-6",
    "12 345 678 5",
    "76086428K",
    "1.000.411-K",
    "1000411-k",
    "123456789-0",
    "esto no es rut",
    "   ",
    "76086428-3",
    "7617343-5",
    "12345678-5",
    "11111111-1",
    "007617343-5",
  ];

  var batchSize = 5000;
  var written = 0;

  while (written < rowCount) {
    var chunkSize = Math.min(batchSize, rowCount - written);
    var chunk = [];

    for (var i = 0; i < chunkSize; i++) {
      var rutIndex = (written + i) % sampleRuts.length;
      chunk.push(["Fila " + (written + i + 1), sampleRuts[rutIndex]]);
    }

    sheet.getRange(written + 2, 1, chunkSize, 2).setValues(chunk);
    written += chunkSize;
    SpreadsheetApp.flush();
  }

  SpreadsheetApp.getActive().toast(
    "Datos de carga creados: " + rowCount + " filas en columnas A-B.",
    APP_MENU_TITLE,
    5
  );
}

function runLoadTestAndReport() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getActive().toast("Primero genera datos de carga.", APP_MENU_TITLE, 5);
    return;
  }

  var rowCount = lastRow - 1;
  var startTime = Date.now();

  var result = startRutJob({
    sheetName: sheet.getName(),
    inputColumn: "B",
    outputColumn: "C",
    batchSize: DEFAULT_BATCH_SIZE,
  });

  while (result && (result.status === JOB_STATUS.PAUSED || result.status === JOB_STATUS.RUNNING)) {
    result = continueRutJob();
  }

  var elapsedMs = Date.now() - startTime;
  var elapsedSeconds = Math.round(elapsedMs / 100) / 10;
  var rowsPerSecond = Math.round(rowCount / (elapsedMs / 1000));

  var summary =
    "=== LOAD TEST RESULT ===\n" +
    "Filas: " + rowCount + "\n" +
    "Tiempo: " + elapsedSeconds + "s\n" +
    "Velocidad: " + rowsPerSecond + " filas/s\n" +
    "Estado final: " + (result ? result.status : "N/A") + "\n" +
    "Validos: " + (result ? result.validRows : "N/A") + "\n" +
    "Invalidos: " + (result ? result.invalidRows : "N/A") + "\n" +
    "Meta 10k<5min: " + (rowCount <= 10000 && elapsedMs < 300000 ? "CUMPLE" : rowCount > 10000 ? "N/A (>10k)" : "NO CUMPLE");

  logEvent_("load_test_completed", {
    rowCount: rowCount,
    elapsedMs: elapsedMs,
    rowsPerSecond: rowsPerSecond,
    status: result ? result.status : "unknown",
  });

  SpreadsheetApp.getUi().alert(summary);
  return summary;
}
