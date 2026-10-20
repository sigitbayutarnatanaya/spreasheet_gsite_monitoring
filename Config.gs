/**
 * Config.gs: named constants and script-property configuration.
 * Nothing here touches a sheet.
 */

const SHEETS = Object.freeze({
  APPLICATIONS: 'CDP_Applications',
  LOG: 'Log',
  DASHBOARD: 'Dashboard'
});

/** Header labels in row 1. Code finds columns by these labels, never by position. */
const COLS = Object.freeze({
  NIP: 'NIP',
  FULL_NAME: 'Full Name',
  NICK_NAME: 'Nick Name',
  TEAM: 'Team',
  EMAIL: 'Email',
  DOCUMENT: 'Document',
  PROGRESS: 'Application Progress',
  EMPLOYEE_NOTE: 'Employee Note',
  HC_NOTE: 'HC Internal Note',
  REGISTERED_AT: 'Registered At',
  UPDATED_AT: 'Last Updated At'
});
const APP_HEADERS = Object.freeze(Object.values(COLS));
const LOG_HEADERS = Object.freeze(['Timestamp', 'Actor', 'Function', 'Row', 'Field', 'Old', 'New', 'Message']);

const STATUS = Object.freeze({
  SUBMITTED: 'Submitted',
  ON_REVIEW: 'On Review',
  PRE_CDP_SCHEDULED: 'Pre-CDP Scheduled',
  CDP_SCHEDULED: 'CDP Scheduled',
  COMPLETED: 'Completed',
  DECLINED: 'Declined'
});
/** Every valid value: dropdown, validation, dashboard. */
const STATUS_LIST = Object.freeze(Object.values(STATUS));
/** Steps of the employee tracker, in order. Declined is a terminal state outside this path. */
const PROGRESS_STEPS = Object.freeze(STATUS_LIST.filter(function (s) { return s !== STATUS.DECLINED; }));
const DEFAULT_STATUS = STATUS.SUBMITTED;

/** Script property keys. */
const PROP = Object.freeze({
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  TIMEZONE: 'TIMEZONE',
  HC_CONTACT: 'HC_CONTACT',
  HC_ADMINS: 'HC_ADMINS',
  MAX_FAILED_ATTEMPTS: 'MAX_FAILED_ATTEMPTS',
  GLOBAL_MAX_FAILED: 'GLOBAL_MAX_FAILED',
  LOCK_MINUTES: 'LOCK_MINUTES',
  SHOW_NOTE_TO_UNVERIFIED: 'SHOW_NOTE_TO_UNVERIFIED',
  VERIFIED_ONLY_DOMAINS: 'VERIFIED_ONLY_DOMAINS'
});

const CONFIG_DEFAULTS = Object.freeze({
  [PROP.TIMEZONE]: 'Asia/Jakarta',
  [PROP.HC_CONTACT]: 'the Human Capital team',
  [PROP.MAX_FAILED_ATTEMPTS]: '5',
  [PROP.GLOBAL_MAX_FAILED]: '200',
  [PROP.LOCK_MINUTES]: '15',
  [PROP.SHOW_NOTE_TO_UNVERIFIED]: 'false'
});

const TS_FORMAT = 'yyyy-MM-dd HH:mm:ss';          // Utilities.formatDate
const SHEET_TS_FORMAT = 'yyyy-mm-dd hh:mm:ss';    // sheet number format
const DISPLAY_TS_FORMAT = "d MMM yyyy, HH:mm (Z)"; // shown to employees
const LOCK_WAIT_MS = 20000;
const WEB_LOCK_WAIT_MS = 5000;
const MAX_NOTE_LENGTH = 1000;
const MAX_CACHE_TTL_SECONDS = 21600;

let configCache_ = null;

/** Reads script properties once per execution and applies defaults. */
function getConfig_() {
  if (configCache_) return configCache_;
  const raw = PropertiesService.getScriptProperties().getProperties();
  const pick = function (key) {
    return raw[key] !== undefined && raw[key] !== '' ? raw[key] : CONFIG_DEFAULTS[key];
  };
  const toInt = function (key, min) {
    const n = parseInt(pick(key), 10);
    return isFinite(n) && n >= min ? n : parseInt(CONFIG_DEFAULTS[key], 10);
  };
  configCache_ = Object.freeze({
    spreadsheetId: raw[PROP.SPREADSHEET_ID] || '',
    timezone: pick(PROP.TIMEZONE),
    hcContact: pick(PROP.HC_CONTACT),
    hcAdmins: parseList_(raw[PROP.HC_ADMINS]),
    maxFailed: toInt(PROP.MAX_FAILED_ATTEMPTS, 1),
    globalMaxFailed: toInt(PROP.GLOBAL_MAX_FAILED, 1),
    lockMinutes: toInt(PROP.LOCK_MINUTES, 1),
    showNoteToUnverified: String(pick(PROP.SHOW_NOTE_TO_UNVERIFIED)).toLowerCase() === 'true',
    verifiedOnlyDomains: parseList_(raw[PROP.VERIFIED_ONLY_DOMAINS])
  });
  return configCache_;
}
