/**
 * Util.gs: small helpers with no business rules.
 * All functions end with "_" so google.script.run cannot call them.
 */

/** Lowercases and trims an email. Returns '' when it is not a plausible address. */
function normalizeEmail_(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  return s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
}

function domainOf_(email) {
  const i = email.lastIndexOf('@');
  return i < 0 ? '' : email.slice(i + 1);
}

/**
 * Normalizes a NIP. Returns '' when invalid.
 * ASSUMPTION: 1-32 chars, letters/digits plus . _ - (change the regex here if the real format differs).
 */
function normalizeNip_(value) {
  const s = String(value == null ? '' : value).trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(s) ? s : '';
}

function parseList_(csv) {
  return String(csv || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

/** Cache-safe key: prefix + SHA-256 of the value. */
function hashKey_(prefix, value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return prefix + Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

let lockDepth_ = 0;

/** Runs fn under the script lock. Re-entrant within one execution. Throws if the lock cannot be taken. */
function withLock_(fn, waitMs) {
  if (lockDepth_ > 0) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(waitMs || LOCK_WAIT_MS);
  lockDepth_++;
  try {
    return fn();
  } finally {
    lockDepth_--;
    lock.releaseLock();
  }
}

/** Row 1 -> { label: zeroBasedIndex }. Inserting or moving columns never breaks lookups. */
function getHeaderMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error('Sheet has no header row');
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = Object.create(null);
  headers.forEach(function (h, i) {
    const key = String(h).trim();
    if (key && !(key in map)) map[key] = i;
  });
  return map;
}

function requireColumns_(map, names) {
  const missing = names.filter(function (n) { return !(n in map); });
  if (missing.length) throw new Error('Missing column(s): ' + missing.join(', '));
}

/** 0-based column index -> A1 letter. */
function columnLetter_(idx) {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function openSpreadsheet_() {
  const id = getConfig_().spreadsheetId;
  if (!id) throw new Error('SPREADSHEET_ID is not configured. Run setup.');
  return SpreadsheetApp.openById(id);
}

function getSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

/** Formats a Date for employees in the configured timezone. Returns '' for anything else. */
function formatDisplayTs_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return '';
  return Utilities.formatDate(value, getConfig_().timezone, DISPLAY_TS_FORMAT);
}
