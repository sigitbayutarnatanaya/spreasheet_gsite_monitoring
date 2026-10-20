/**
 * Audit.gs: the Log sheet and the ONLY helper that writes row data.
 * Every data write goes through commitColumnWrite_, which logs old and new values.
 */

/** Stops a value from being parsed as a formula when written to a sheet. */
function safeCell_(value) {
  const s = String(value == null ? '' : value).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function logValue_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, getConfig_().timezone, TS_FORMAT);
  return safeCell_(value);
}

/** @return {Array} one Log row matching LOG_HEADERS. */
function buildLogRow_(actor, fn, row, field, oldValue, newValue, message) {
  return [new Date(), safeCell_(actor), fn, row, safeCell_(field), logValue_(oldValue), logValue_(newValue), safeCell_(message)];
}

/** Batch-appends rows to Log under the lock. Never throws (falls back to console). */
function appendLogRows_(rows) {
  if (!rows.length) return;
  try {
    withLock_(function () {
      const sheet = getSheet_(openSpreadsheet_(), SHEETS.LOG);
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    }, WEB_LOCK_WAIT_MS);
  } catch (err) {
    console.error('Log write failed: ' + err);
  }
}

/** Writes a failure to Log. Forbidden calls are ignored so visitors cannot flood the Log. */
function logError_(fn, row, err, actor) {
  if (err && err.name === 'ForbiddenError') return;
  const message = 'ERROR: ' + (err && err.message ? err.message : String(err));
  console.error(fn + ' ' + message);
  appendLogRows_([buildLogRow_(actor || currentActor_(null), fn, row, '', '', '', message)]);
}

function sameValue_(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return String(a == null ? '' : a) === String(b == null ? '' : b);
}

/**
 * The single write path for row data. Writes one column block in one setValues call
 * and logs every cell that actually changed.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} firstRow 1-based first row of the block.
 * @param {string} field Header label of the column.
 * @param {Array<Array>} newValues One [value] per row. undefined = leave unchanged.
 * @param {string} fn Calling function name, for the Log.
 * @param {string} actor Who caused the write.
 * @return {number} Number of cells changed.
 */
function commitColumnWrite_(sheet, firstRow, field, newValues, fn, actor) {
  return withLock_(function () {
    const map = getHeaderMap_(sheet);
    requireColumns_(map, [field]);
    const range = sheet.getRange(firstRow, map[field] + 1, newValues.length, 1);
    const oldValues = range.getValues();
    const logRows = [];
    const out = oldValues.map(function (oldRow, i) {
      const next = newValues[i][0];
      if (next === undefined || sameValue_(oldRow[0], next)) return [oldRow[0]];
      logRows.push(buildLogRow_(actor, fn, firstRow + i, field, oldRow[0], next, 'WRITE'));
      return [next];
    });
    if (!logRows.length) return 0;
    range.setValues(out);
    appendLogRows_(logRows);
    return logRows.length;
  });
}
