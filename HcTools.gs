/**
 * HcTools.gs: actions behind the "HC Tools" menu.
 * Both functions are public (menu handlers), so each starts with assertHc_().
 */

/**
 * Menu: clears lockout counters for an email, a NIP, or ALL (the global counter).
 */
function hcClearLockout() {
  try {
    assertHc_();
    const ui = SpreadsheetApp.getUi();
    const res = ui.prompt('Clear lockout', 'Enter an email, a NIP, or ALL (global counter):', ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    const input = res.getResponseText().trim();
    const keys = [];
    if (input.toUpperCase() === 'ALL') keys.push('G');
    const email = normalizeEmail_(input);
    if (email) keys.push(hashKey_('E:', email));
    const nip = normalizeNip_(input);
    if (nip && input.toUpperCase() !== 'ALL') keys.push(hashKey_('N:', nip));
    if (!keys.length) {
      ui.alert('Nothing to clear. Enter a valid email, a NIP, or ALL.');
      return;
    }
    withLock_(function () { CacheService.getScriptCache().removeAll(keys); }, WEB_LOCK_WAIT_MS);
    appendLogRows_([buildLogRow_(currentActor_(null), 'hcClearLockout', '', 'lockout', '', input, 'CLEARED')]);
    ui.alert('Lockout cleared.');
  } catch (err) {
    logError_('hcClearLockout', '', err);
  }
}

/**
 * Menu: runs setup/repair and (re)installs the onEdit trigger. Idempotent.
 */
function hcRunSetup() {
  try {
    assertHc_();
    const ui = SpreadsheetApp.getUi();
    setupProject();
    installTriggers();
    ui.alert('Setup complete. Check the HC_ADMINS and HC_CONTACT script properties.');
  } catch (err) {
    logError_('hcRunSetup', '', err);
    if (err && err.name !== 'ForbiddenError') {
      SpreadsheetApp.getUi().alert('Setup failed. See the Log sheet or the execution log.');
    }
  }
}
