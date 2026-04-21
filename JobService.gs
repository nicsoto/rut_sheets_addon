function withDocumentLock_(callback) {
  const lock = LockService.getDocumentLock();
  const acquired = lock.tryLock(5000);
  if (!acquired) {
    throw new Error("No se pudo obtener lock del documento. Intenta nuevamente en unos segundos.");
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function validateStartPayload_(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Debes enviar configuracion valida para iniciar el proceso.");
  }

  const requiredFields = ["sheetName", "inputColumn", "outputColumn"];
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      throw new Error("Falta el campo obligatorio: " + field);
    }
  });
}

function createJobFromPayload_(payload) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(String(payload.sheetName));
  if (!sheet) {
    throw new Error("No se encontro la hoja seleccionada: " + payload.sheetName);
  }

  const inputColumn = parseColumnInput_(payload.inputColumn);
  const outputColumn = parseColumnInput_(payload.outputColumn);

  if (inputColumn >= outputColumn && inputColumn < outputColumn + OUTPUT_WIDTH) {
    throw new Error("La columna de entrada no puede superponerse con las columnas de salida.");
  }

  const batchSize = normalizeBatchSize_(payload.batchSize);
  const lastRow = sheet.getLastRow();
  if (lastRow < PROCESSING_START_ROW) {
    throw new Error("La hoja no tiene datos para procesar desde la fila " + PROCESSING_START_ROW + ".");
  }

  const requestedRows = lastRow - PROCESSING_START_ROW + 1;
  const entitlement = getEffectiveEntitlement_();
  const hasUnlimitedRows = !Number.isFinite(entitlement.rowsRemaining);
  if (!hasUnlimitedRows && entitlement.rowsRemaining <= 0) {
    throw new Error(
      "Ya alcanzaste tu limite mensual de filas para el plan " +
        entitlement.planId +
        ". Ve al enlace de upgrade para seguir procesando."
    );
  }

  const allowedRows = hasUnlimitedRows
    ? requestedRows
    : Math.min(requestedRows, Math.max(0, entitlement.rowsRemaining));

  if (allowedRows <= 0) {
    throw new Error("No quedan filas disponibles para procesar en tu plan actual.");
  }

  const effectiveEndRow = PROCESSING_START_ROW + allowedRows - 1;
  const restrictedByPlan = allowedRows < requestedRows;

  ensureOutputColumns_(sheet, outputColumn);
  ensureOutputHeaders_(sheet, outputColumn);

  const now = new Date().toISOString();
  return {
    id: "job_" + Date.now(),
    status: JOB_STATUS.RUNNING,
    sheetName: sheet.getName(),
    sheetId: sheet.getSheetId(),
    startRow: PROCESSING_START_ROW,
    endRow: effectiveEndRow,
    totalRows: allowedRows,
    requestedRows,
    skippedRowsByPlan: requestedRows - allowedRows,
    cursor: PROCESSING_START_ROW,
    inputColumn,
    outputColumn,
    batchSize,
    planId: entitlement.planId,
    planSource: entitlement.source,
    usagePeriodKey: entitlement.periodKey,
    monthlyRowsLimit: entitlement.monthlyRowsLimit,
    rowsRemainingAtStart: entitlement.rowsRemaining,
    restrictedByPlan,
    processedRows: 0,
    validRows: 0,
    invalidRows: 0,
    startedAt: now,
    updatedAt: now,
    finishedAt: "",
    lastError: "",
  };
}

function saveCurrentJob_(job) {
  PropertiesService.getDocumentProperties().setProperty(JOB_PROPERTY_KEY, JSON.stringify(job));
}

function getCurrentJob_() {
  const raw = PropertiesService.getDocumentProperties().getProperty(JOB_PROPERTY_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    clearCurrentJob_();
    throw new Error("El estado de proceso guardado esta corrupto. Se limpio automaticamente.");
  }
}

function clearCurrentJob_() {
  PropertiesService.getDocumentProperties().deleteProperty(JOB_PROPERTY_KEY);
}

function getUserPrefs_() {
  const raw = PropertiesService.getUserProperties().getProperty(USER_PREFS_KEY);
  if (!raw) {
    return {
      inputColumn: "A",
      outputColumn: "B",
      batchSize: DEFAULT_BATCH_SIZE,
      sheetName: "",
    };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return {
      inputColumn: "A",
      outputColumn: "B",
      batchSize: DEFAULT_BATCH_SIZE,
      sheetName: "",
    };
  }
}

function saveUserPrefs_(prefs) {
  PropertiesService.getUserProperties().setProperty(USER_PREFS_KEY, JSON.stringify(prefs));
}

function normalizeBatchSize_(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BATCH_SIZE;
  }
  const rounded = Math.floor(parsed);
  return Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, rounded));
}

function parseColumnInput_(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const numeric = Math.floor(value);
    if (numeric < 1) {
      throw new Error("La columna numerica debe ser mayor o igual a 1.");
    }
    return numeric;
  }

  const text = String(value || "").trim().toUpperCase();
  if (!text) {
    throw new Error("Debes indicar una columna valida (ej: A o 1).");
  }

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    if (numeric < 1) {
      throw new Error("La columna numerica debe ser mayor o igual a 1.");
    }
    return numeric;
  }

  if (/^[A-Z]+$/.test(text)) {
    return columnLetterToNumber_(text);
  }

  throw new Error("Columna invalida: " + value + ". Usa formato A, B, C o numero.");
}

function columnLetterToNumber_(letters) {
  let number = 0;
  for (let index = 0; index < letters.length; index += 1) {
    number = number * 26 + (letters.charCodeAt(index) - 64);
  }
  return number;
}

function columnNumberToLetter_(number) {
  let current = Number(number);
  if (!Number.isFinite(current) || current < 1) {
    throw new Error("No se puede convertir columna invalida: " + number);
  }

  let result = "";
  while (current > 0) {
    const modulo = (current - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    current = Math.floor((current - modulo) / 26);
  }
  return result;
}

function ensureOutputColumns_(sheet, outputColumn) {
  const requiredLastColumn = outputColumn + OUTPUT_WIDTH - 1;
  const maxColumns = sheet.getMaxColumns();
  if (requiredLastColumn <= maxColumns) {
    return;
  }

  const missingColumns = requiredLastColumn - maxColumns;
  sheet.insertColumnsAfter(maxColumns, missingColumns);
}

function ensureOutputHeaders_(sheet, outputColumn) {
  sheet.getRange(1, outputColumn, 1, OUTPUT_WIDTH).setValues([
    ["RUT Normalizado", "Es Valido", "Motivo", "Es Duplicado"],
  ]);
}

function buildJobResponse_(job) {
  if (!job) {
    return null;
  }

  const progressRaw = job.totalRows > 0 ? (job.processedRows / job.totalRows) * 100 : 0;
  const progressPct = Math.max(0, Math.min(100, Math.round(progressRaw * 10) / 10));

  return {
    id: job.id,
    status: job.status,
    sheetName: job.sheetName,
    inputColumn: columnNumberToLetter_(job.inputColumn),
    outputColumn: columnNumberToLetter_(job.outputColumn),
    batchSize: job.batchSize,
    processedRows: job.processedRows,
    totalRows: job.totalRows,
    requestedRows: job.requestedRows || job.totalRows,
    skippedRowsByPlan: job.skippedRowsByPlan || 0,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    planId: job.planId || PLAN_ID.FREE,
    planSource: job.planSource || "default",
    monthlyRowsLimit: job.monthlyRowsLimit,
    rowsRemainingAtStart: job.rowsRemainingAtStart,
    restrictedByPlan: Boolean(job.restrictedByPlan),
    progressPct,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    lastError: job.lastError,
    message: buildJobMessage_(job, progressPct),
  };
}

function buildJobMessage_(job, progressPct) {
  if (job.status === JOB_STATUS.DONE) {
    return "Proceso completado. Filas procesadas: " + job.processedRows + ".";
  }

  if (job.status === JOB_STATUS.LIMIT_REACHED) {
    return (
      "Proceso detenido por limite de plan. Procesadas " +
      job.processedRows +
      " de " +
      (job.requestedRows || job.totalRows) +
      " filas solicitadas."
    );
  }

  if (job.status === JOB_STATUS.CANCELED) {
    return "Proceso cancelado por el usuario.";
  }

  if (job.status === JOB_STATUS.FAILED) {
    return "Proceso fallido: " + job.lastError;
  }

  if (job.status === JOB_STATUS.PAUSED || job.status === JOB_STATUS.RUNNING) {
    return "Procesando... " + progressPct + "%";
  }

  return "Sin proceso activo.";
}

function runJobServiceSelfTest_() {
  const tests = [
    { input: "A", expected: 1 },
    { input: "Z", expected: 26 },
    { input: "AA", expected: 27 },
    { input: "52", expected: 52 },
    { input: 9, expected: 9 },
  ];

  const failures = [];

  tests.forEach((testCase) => {
    const output = parseColumnInput_(testCase.input);
    if (output !== testCase.expected) {
      failures.push(
        "parseColumnInput(" +
          testCase.input +
          ") esperado=" +
          testCase.expected +
          ", obtenido=" +
          output
      );
      return;
    }

    const roundTrip = columnLetterToNumber_(columnNumberToLetter_(output));
    if (roundTrip !== output) {
      failures.push("Round-trip fallo para columna " + output + ".");
    }
  });

  if (failures.length > 0) {
    throw new Error("runJobServiceSelfTest_ fallo:\n" + failures.join("\n"));
  }

  return "runJobServiceSelfTest_ OK";
}
