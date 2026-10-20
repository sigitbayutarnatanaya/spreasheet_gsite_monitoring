/**
 * Auth.gs: who is calling, and what they may do. All checks run on the server.
 *
 * Viewer identity (web app):
 *  - If Google gives us the viewer's email (Session.getActiveUser), that email is
 *    authoritative and any email typed by the client is ignored.
 *  - Otherwise (other-domain viewers) the typed email is used, but it is UNVERIFIED.
 *    Typed emails on a "verified-only" domain (default: the script owner's domain)
 *    are rejected, because viewers from that domain always arrive verified.
 */

/** Email Google verified for the current viewer, or ''. */
function getVerifiedEmail_() {
  return normalizeEmail_(Session.getActiveUser().getEmail());
}

/**
 * @param {string} typedEmail Client-supplied, untrusted.
 * @return {{email: string, verified: boolean}} email is '' when no usable identity exists.
 */
function resolveViewer_(typedEmail) {
  const verified = getVerifiedEmail_();
  if (verified) return { email: verified, verified: true };
  const typed = normalizeEmail_(typedEmail);
  if (!typed || getVerifiedOnlyDomains_().indexOf(domainOf_(typed)) !== -1) {
    return { email: '', verified: false };
  }
  return { email: typed, verified: false };
}

function getVerifiedOnlyDomains_() {
  const configured = getConfig_().verifiedOnlyDomains;
  if (configured.length) return configured;
  const ownerDomain = domainOf_(normalizeEmail_(Session.getEffectiveUser().getEmail()));
  return ownerDomain ? [ownerDomain] : [];
}

/**
 * Guard for every function that is public but not an employee endpoint
 * (menu actions, setup, trigger installers). Public functions can be called by any
 * web-app visitor through google.script.run, so each one must call this first.
 * Falls back to the script owner while HC_ADMINS is still empty (first setup).
 * @throws {Error} name = 'ForbiddenError'
 */
function assertHc_() {
  const active = getVerifiedEmail_();
  const admins = getConfig_().hcAdmins;
  const allowed = admins.length ? admins : [normalizeEmail_(Session.getEffectiveUser().getEmail())];
  if (!active || allowed.indexOf(active) === -1) {
    const err = new Error('Forbidden');
    err.name = 'ForbiddenError';
    throw err;
  }
}

/** Best-effort actor label for Log rows. */
function currentActor_(e) {
  const active = getVerifiedEmail_();
  if (active) return active;
  const fromEvent = e && e.user && typeof e.user.getEmail === 'function' ? normalizeEmail_(e.user.getEmail()) : '';
  return fromEvent || '(unverified)';
}
