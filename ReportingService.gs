function exportLastJobReport() {
  const job = getCurrentJob_();
  if (!job) {
    SpreadsheetApp.getActive().toast("No hay proceso para reportar.", APP_MENU_TITLE, 5);
    return null;
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const reportName = buildReportSheetName_();
  const reportSheet = spreadsheet.insertSheet(reportName);

  const rows = [
    ["RUT Cleaner Report", ""],
    ["Generado", new Date().toISOString()],
    ["Job ID", job.id],
    ["Estado", job.status],
    ["Hoja", job.sheetName],
    ["Plan", job.planId || PLAN_ID.FREE],
    ["Periodo uso", job.usagePeriodKey || ""],
    ["Filas solicitadas", job.requestedRows || job.totalRows],
    ["Filas procesadas", job.processedRows],
    ["Filas validas", job.validRows],
    ["Filas invalidas", job.invalidRows],
    ["Filas omitidas por plan", job.skippedRowsByPlan || 0],
    ["Inicio", job.startedAt || ""],
    ["Ultima actualizacion", job.updatedAt || ""],
    ["Fin", job.finishedAt || ""],
    ["Error", job.lastError || ""],
  ];

  reportSheet.getRange(1, 1, rows.length, 2).setValues(rows);
  reportSheet.getRange(1, 1).setFontWeight("bold").setFontSize(13);
  reportSheet.getRange(1, 1, rows.length, 1).setFontWeight("bold");

  const reasonCounts = collectReasonCounts_(job);
  const reasonStartRow = rows.length + 2;
  reportSheet.getRange(reasonStartRow, 1, 1, 2).setValues([["Motivo", "Cantidad"]]);
  reportSheet.getRange(reasonStartRow, 1, 1, 2).setFontWeight("bold");

  if (reasonCounts.length > 0) {
    reportSheet.getRange(reasonStartRow + 1, 1, reasonCounts.length, 2).setValues(reasonCounts);
  }

  reportSheet.autoResizeColumns(1, 2);
  SpreadsheetApp.setActiveSheet(reportSheet);

  logEvent_("report_exported", {
    jobId: job.id,
    reportSheet: reportName,
  });

  SpreadsheetApp.getActive().toast("Reporte generado: " + reportName, APP_MENU_TITLE, 5);
  return reportName;
}

function collectReasonCounts_(job) {
  if (!job || job.processedRows <= 0) {
    return [];
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = spreadsheet.getSheetByName(job.sheetName);
  if (!sourceSheet) {
    return [];
  }

  const rowCount = Math.min(job.processedRows, job.totalRows || job.processedRows);
  if (rowCount <= 0) {
    return [];
  }

  const reasonColumn = job.outputColumn + 2;
  const reasonValues = sourceSheet
    .getRange(job.startRow, reasonColumn, rowCount, 1)
    .getDisplayValues();

  const counts = {};
  reasonValues.forEach((row) => {
    const key = String(row[0] || "").trim() || "SIN_MOTIVO";
    counts[key] = (counts[key] || 0) + 1;
  });

  const output = Object.keys(counts).map((reason) => [reason, counts[reason]]);
  output.sort((a, b) => b[1] - a[1]);
  return output;
}

function buildReportSheetName_() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return "RUT_Report_" + year + month + day + "_" + hour + minute + second;
}
