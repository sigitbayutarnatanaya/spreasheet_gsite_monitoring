/**
 * Triggers.gs: spreadsheet triggers.
 *
 * handleEdit (installable onEdit): defaults the status, stamps Registered At / Last Updated At,
 * and logs single-cell manual edits. Script writes do not fire onEdit, so there is no loop.
 * It is idempotent: it fills only empty defaults and ignores edits confined to the auto columns.
 */

/**
 * Installable onEdit handler.
 * @param {Object} e Spreadsheet edit event.
 */
function handleEdit(e) {
  let row = '';
  try {
    // Public functions can be called from the browser; a real event always carries a Range.
    if (!e || !e.range || typeof e.range.getSheet !== 'function') return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEETS.APPLICATIONS) return;
    const firstRow = Math.max(e.range.getRow(), 2);
    const lastRow = Math.min(e.range.getLastRow(), sheet.getLastRow());
    if (lastRow < firstRow) return;
    row = firstRow;
    const actor = currentActor_(e);
    withLock_(function () {
      const map = getHeaderMap_(sheet);
      stampRows_(sheet, map, firstRow, lastRow - firstRow + 1, e.range, actor);
      logManualEdit_(e, map, actor);
    });
  } catch (err) {
    logError_('handleEdit', row, err);
  }
}

function stampRows_(sheet, map, firstRow, numRows, edited, actor) {
  requireColumns_(map, [COLS.NIP, COLS.PROGRESS, COLS.REGISTERED_AT, COLS.UPDATED_AT]);
  const regIdx = map[COLS.REGISTERED_AT];
  const updIdx = map[COLS.UPDATED_AT];
  const c1 = edited.getColumn() - 1;
  const c2 = edited.getLastColumn() - 1;
  const managedInside = [regIdx, updIdx].filter(function (i) { return i >= c1 && i <= c2; }).length;
  if (c2 - c1 + 1 <= managedInside) return; // only auto columns were touched

  const block = sheet.getRange(firstRow, 1, numRows, sheet.getLastColumn()).getValues();
  const now = new Date();
  const progress = [];
  const registered = [];
  const updated = [];
  const warnings = [];
  block.forEach(function (r, i) {
    if (String(r[map[COLS.NIP]]).trim() === '') {
      progress.push([undefined]);
      registered.push([undefined]);
      updated.push([undefined]);
      return;
    }
    const status = String(r[map[COLS.PROGRESS]]).trim();
    if (status && STATUS_LIST.indexOf(status) === -1) {
      warnings.push(buildLogRow_(actor, 'handleEdit', firstRow + i, COLS.PROGRESS, '', status, 'INVALID_STATUS'));
    }
    progress.push([status ? undefined : DEFAULT_STATUS]);
    registered.push([r[regIdx] === '' ? now : undefined]);
    updated.push([now]);
  });

  commitColumnWrite_(sheet, firstRow, COLS.PROGRESS, progress, 'handleEdit', actor);
  commitColumnWrite_(sheet, firstRow, COLS.REGISTERED_AT, registered, 'handleEdit', actor);
  commitColumnWrite_(sheet, firstRow, COLS.UPDATED_AT, updated, 'handleEdit', actor);
  appendLogRows_(warnings);
}

/** Audit trail for HC's own single-cell edits (old and new value). */
function logManualEdit_(e, map, actor) {
  const r = e.range;
  if (r.getNumRows() !== 1 || r.getNumColumns() !== 1 || r.getRow() < 2) return;
  const field = Object.keys(map).filter(function (k) { return map[k] === r.getColumn() - 1; })[0];
  if (!field) return;
  appendLogRows_([buildLogRow_(actor, 'handleEdit', r.getRow(), field, e.oldValue, e.value, 'MANUAL_EDIT')]);
}

/**
 * Simple trigger: adds the HC Tools menu.
 * @param {Object} e Open event (unused).
 */
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('HC Tools')
      .addItem('Clear lockout…', 'hcClearLockout')
      .addItem('Run setup / repair', 'hcRunSetup')
      .addToUi();
  } catch (err) {
    console.error('onOpen: ' + err);
  }
}

/**
 * Idempotent: removes this project's handleEdit triggers and creates exactly one.
 * HC only.
 */
function installTriggers() {
  assertHc_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'handleEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
}
