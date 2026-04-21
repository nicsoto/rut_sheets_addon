function processJobChunk_(job) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(job.sheetName);

  if (!sheet || sheet.getSheetId() !== job.sheetId) {
    job.status = JOB_STATUS.FAILED;
    job.lastError = "No se encontro la hoja del proceso activo. Verifica si fue renombrada o eliminada.";
    job.updatedAt = new Date().toISOString();
    saveCurrentJob_(job);
    return buildJobResponse_(job);
  }

  const executionStart = Date.now();
  let cursor = job.cursor;

  logEvent_("job_chunk_begin", {
    jobId: job.id,
    cursor,
    endRow: job.endRow,
    batchSize: job.batchSize,
  });

  try {
    while (cursor <= job.endRow) {
      const elapsed = Date.now() - executionStart;
      if (elapsed >= MAX_EXECUTION_MS) {
        job.status = JOB_STATUS.PAUSED;
        job.updatedAt = new Date().toISOString();
        saveCurrentJob_(job);
        break;
      }

      const batchEnd = Math.min(cursor + job.batchSize - 1, job.endRow);
      const chunkStartedAt = Date.now();
      const summary = processOneBatch_(sheet, job, cursor, batchEnd);
      consumeRowsFromPlan_(job, summary.rowCount);
      cursor = batchEnd + 1;
      job.cursor = cursor;
      job.lastChunkMs = Date.now() - chunkStartedAt;
      job.updatedAt = new Date().toISOString();
      saveCurrentJob_(job);

      logEvent_("job_chunk_processed", {
        jobId: job.id,
        batchStart: summary.batchStart,
        batchEnd,
        chunkMs: job.lastChunkMs,
        processedRows: job.processedRows,
        totalRows: job.totalRows,
      });
    }

    if (cursor > job.endRow) {
      finalizeDuplicates_(sheet, job);
      if (job.restrictedByPlan && job.skippedRowsByPlan > 0) {
        job.status = JOB_STATUS.LIMIT_REACHED;
      } else {
        job.status = JOB_STATUS.DONE;
      }
      job.updatedAt = new Date().toISOString();
      job.finishedAt = job.updatedAt;
      saveCurrentJob_(job);

      logEvent_("job_finished", {
        jobId: job.id,
        status: job.status,
        processedRows: job.processedRows,
        requestedRows: job.requestedRows,
        validRows: job.validRows,
        invalidRows: job.invalidRows,
      });
    }
  } catch (error) {
    job.status = JOB_STATUS.FAILED;
    job.lastError = error && error.message ? error.message : String(error);
    job.updatedAt = new Date().toISOString();
    saveCurrentJob_(job);
    logEvent_("job_failed", {
      jobId: job.id,
      error: job.lastError,
      processedRows: job.processedRows,
    });
  }

  return buildJobResponse_(job);
}

function processOneBatch_(sheet, job, batchStart, batchEnd) {
  const rowCount = batchEnd - batchStart + 1;
  const inputRange = sheet.getRange(batchStart, job.inputColumn, rowCount, 1);
  const sourceValues = inputRange.getDisplayValues();

  const outputRows = [];
  let validRows = 0;
  let invalidRows = 0;

  for (let index = 0; index < sourceValues.length; index += 1) {
    const rawValue = sourceValues[index][0];
    const result = validateAndNormalizeRut(rawValue);

    outputRows.push([result.normalized, result.isValid, result.reason]);
    if (result.isValid) {
      validRows += 1;
    } else {
      invalidRows += 1;
    }
  }

  if (outputRows.length > 0) {
    sheet.getRange(batchStart, job.outputColumn, outputRows.length, 3).setValues(outputRows);
  }

  job.processedRows += rowCount;
  job.validRows += validRows;
  job.invalidRows += invalidRows;

  return {
    rowCount,
    validRows,
    invalidRows,
    batchStart,
    batchEnd,
  };
}

function finalizeDuplicates_(sheet, job) {
  if (job.totalRows <= 0) {
    return;
  }

  const normalizedRange = sheet.getRange(job.startRow, job.outputColumn, job.totalRows, 1);
  const normalizedValues = normalizedRange.getDisplayValues();

  const counts = {};
  normalizedValues.forEach((row) => {
    const normalized = String(row[0] || "").trim().toUpperCase();
    if (!normalized) {
      return;
    }
    counts[normalized] = (counts[normalized] || 0) + 1;
  });

  const duplicateFlags = normalizedValues.map((row) => {
    const normalized = String(row[0] || "").trim().toUpperCase();
    if (!normalized) {
      return [false];
    }
    return [counts[normalized] > 1];
  });

  sheet.getRange(job.startRow, job.outputColumn + 3, duplicateFlags.length, 1).setValues(duplicateFlags);
}

function consumeRowsFromPlan_(job, rowCount) {
  if (!rowCount || rowCount <= 0) {
    return;
  }

  const periodKey = job.usagePeriodKey || getUsagePeriodKey_(new Date());
  incrementUsageRows_(periodKey, rowCount);
}
