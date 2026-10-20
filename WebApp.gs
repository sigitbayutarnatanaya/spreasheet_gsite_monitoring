/**
 * WebApp.gs: the only code employees can reach.
 * Public functions here: doGet and getCdpStatus. Everything else ends with "_".
 */

/**
 * Serves the employee page.
 * @param {Object} e Event object (unused).
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  try {
    const tpl = HtmlService.createTemplateFromFile('Index');
    tpl.needsEmail = !getVerifiedEmail_();
    tpl.hcContact = getConfig_().hcContact;
    return tpl.evaluate()
      .setTitle('CDP Application Status')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    logError_('doGet', '', err);
    return HtmlService.createHtmlOutput('<p>This page is temporarily unavailable. Please contact HC.</p>');
  }
}

/**
 * Employee endpoint (google.script.run). Returns the caller's own CDP status only.
 * Authorization: the row must match BOTH the NIP and the viewer's email. A wrong NIP,
 * someone else's NIP, and an unknown email all return the same NOT_FOUND.
 * @param {string} nip Untrusted.
 * @param {string} email Untrusted; ignored when Google has verified the viewer.
 * @return {{ok: boolean, code?: string, status?: string, stepIndex?: number, steps?: string[],
 *   note?: string, noteWithheld?: boolean, updatedAt?: string}}
 */
function getCdpStatus(nip, email) {
  let actor = '(unverified)';
  try {
    const cfg = getConfig_();
    const viewer = resolveViewer_(email);
    if (viewer.verified) actor = viewer.email;
    const nipN = normalizeNip_(nip);

    const scopes = throttleScopes_(nipN, viewer.email, viewer.verified);
    if (isThrottled_(scopes)) return { ok: false, code: 'LOCKED' };

    const match = nipN && viewer.email ? findApplicant_(nipN, viewer.email) : null;
    if (!match) {
      recordFailure_(scopes, actor);
      return { ok: false, code: 'NOT_FOUND' };
    }

    if (STATUS_LIST.indexOf(match.status) === -1) {
      logError_('getCdpStatus', match.row, new Error('Invalid status value in sheet'), actor);
      return { ok: false, code: 'ERROR' };
    }

    // Declined shows the status only: no tracker steps.
    const declined = match.status === STATUS.DECLINED;
    const showNote = viewer.verified || cfg.showNoteToUnverified;
    return {
      ok: true,
      status: match.status,
      stepIndex: declined ? -1 : PROGRESS_STEPS.indexOf(match.status),
      steps: declined ? [] : PROGRESS_STEPS.slice(),
      note: showNote ? match.note : '',
      noteWithheld: !showNote,
      updatedAt: formatDisplayTs_(match.updatedAt)
    };
  } catch (err) {
    logError_('getCdpStatus', '', err, actor);
    return { ok: false, code: 'ERROR' };
  }
}

/**
 * Finds the one row whose NIP and Email both match. Reads two narrow columns, then one row.
 * @return {{row: number, status: string, note: string, updatedAt: *}|null}
 */
function findApplicant_(nip, email) {
  const sheet = getSheet_(openSpreadsheet_(), SHEETS.APPLICATIONS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const map = getHeaderMap_(sheet);
  requireColumns_(map, [COLS.NIP, COLS.EMAIL, COLS.PROGRESS, COLS.EMPLOYEE_NOTE, COLS.UPDATED_AT]);

  const count = lastRow - 1;
  const nips = sheet.getRange(2, map[COLS.NIP] + 1, count, 1).getValues();
  const emails = sheet.getRange(2, map[COLS.EMAIL] + 1, count, 1).getValues();
  let idx = -1;
  for (let i = 0; i < count; i++) {
    if (normalizeNip_(nips[i][0]) === nip && normalizeEmail_(emails[i][0]) === email) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return null;

  const row = idx + 2;
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    row: row,
    status: String(values[map[COLS.PROGRESS]]).trim(),
    note: String(values[map[COLS.EMPLOYEE_NOTE]] || '').slice(0, MAX_NOTE_LENGTH),
    updatedAt: values[map[COLS.UPDATED_AT]]
  };
}
