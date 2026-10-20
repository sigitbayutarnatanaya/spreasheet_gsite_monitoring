/**
 * Setup.gs: idempotent setup and repair. Structure writes (headers, validation,
 * formats, dashboard formulas) are not row data, so they are recorded as one Log line
 * instead of going through commitColumnWrite_.
 */

/**
 * Creates missing sheets and headers, applies validation and formats, seeds script
 * properties that are still empty, and rebuilds the Dashboard. Safe to re-run.
 * HC only (script owner on the very first run).
 */
function setupProject() {
  assertHc_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  withLock_(function () {
    seedProperties_(ss);
    ss.setSpreadsheetTimeZone(getConfig_().timezone);
    const apps = ensureSheet_(ss, SHEETS.APPLICATIONS, APP_HEADERS);
    const log = ensureSheet_(ss, SHEETS.LOG, LOG_HEADERS);
    const dash = ensureSheet_(ss, SHEETS.DASHBOARD, []);
    applyApplicationsSchema_(apps);
    log.getRange(2, 1, Math.max(log.getMaxRows() - 1, 1), 1).setNumberFormat(SHEET_TS_FORMAT);
    buildDashboard_(dash, apps);
    appendLogRows_([buildLogRow_(currentActor_(null), 'setupProject', '', '', '', '', 'Setup/repair completed')]);
  });
}

function seedProperties_(ss) {
  const store = PropertiesService.getScriptProperties();
  const existing = store.getProperties();
  const wanted = Object.assign({}, CONFIG_DEFAULTS);
  wanted[PROP.SPREADSHEET_ID] = ss.getId();
  wanted[PROP.HC_ADMINS] = getVerifiedEmail_();
  const missing = {};
  Object.keys(wanted).forEach(function (k) {
    if (!existing[k] && wanted[k]) missing[k] = wanted[k];
  });
  if (Object.keys(missing).length) store.setProperties(missing, false);
  configCache_ = null;
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers.length && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function applyApplicationsSchema_(sheet) {
  const map = getHeaderMap_(sheet);
  requireColumns_(map, APP_HEADERS);
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const col = function (name) { return sheet.getRange(2, map[name] + 1, rows, 1); };
  const nipL = columnLetter_(map[COLS.NIP]);
  const emailL = columnLetter_(map[COLS.EMAIL]);

  col(COLS.NIP)
    .setNumberFormat('@')
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied('=COUNTIF($' + nipL + ':$' + nipL + ', ' + nipL + '2)=1')
      .setAllowInvalid(false)
      .setHelpText('NIP must be unique.')
      .build());
  col(COLS.EMAIL)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied('=REGEXMATCH(' + emailL + '2, "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")')
      .setAllowInvalid(false)
      .setHelpText('Use the full Google/Workspace login email.')
      .build());
  col(COLS.PROGRESS)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_LIST, true)
      .setAllowInvalid(false)
      .build());
  col(COLS.REGISTERED_AT).setNumberFormat(SHEET_TS_FORMAT);
  col(COLS.UPDATED_AT).setNumberFormat(SHEET_TS_FORMAT);
}

/** HC-only dashboard. Plain formulas: no script, no cache, no exposure to employees. */
function buildDashboard_(dash, apps) {
  const map = getHeaderMap_(apps);
  const ref = function (name) {
    const L = columnLetter_(map[name]);
    return SHEETS.APPLICATIONS + '!$' + L + '$2:$' + L;
  };
  const n = STATUS_LIST.length;
  dash.clear();
  dash.getRange(1, 1, 1, 2).setValues([['Status', 'Applicants']]).setFontWeight('bold');
  dash.getRange(2, 1, n, 1).setValues(STATUS_LIST.map(function (s) { return [s]; }));
  dash.getRange(2, 2, n, 1).setFormulas(STATUS_LIST.map(function (s, i) {
    return ['=COUNTIF(' + ref(COLS.PROGRESS) + ', A' + (i + 2) + ')'];
  }));
  dash.getRange(n + 2, 1).setValue('Total records');
  dash.getRange(n + 2, 2).setFormula('=COUNTA(' + ref(COLS.NIP) + ')');
  dash.getRange(1, 4, 1, 2).setValues([['Team', 'Applicants']]).setFontWeight('bold');
  const team = ref(COLS.TEAM);
  dash.getRange(2, 4, 1, 2).setFormulas([[
    '=IFERROR(SORT(UNIQUE(FILTER(' + team + ', ' + team + '<>""))), "")',
    '=ARRAYFORMULA(IF(D2:D="", "", COUNTIF(' + team + ', D2:D)))'
  ]]);
}
