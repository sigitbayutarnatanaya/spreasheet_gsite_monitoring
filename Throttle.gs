/**
 * Throttle.gs: failed-lookup counters (CacheService, best effort).
 *
 * Verified viewers can only ever match their own row, so they get one counter (their
 * email). Unverified viewers (typed email) get three: email, NIP, and a global one.
 * Counters count FAILURES regardless of whether the typed values exist, so lockout
 * behavior never reveals whether a NIP or email is real.
 */

/**
 * @param {string} nip Normalized NIP or ''.
 * @param {string} email Normalized email or ''.
 * @param {boolean} verified
 * @return {Array<{key: string, label: string, limit: number, value: string}>}
 */
function throttleScopes_(nip, email, verified) {
  const cfg = getConfig_();
  const scopes = [];
  if (email) scopes.push({ key: hashKey_('E:', email), label: 'email', limit: cfg.maxFailed, value: email });
  if (verified) return scopes;
  scopes.push({ key: 'G', label: 'global', limit: cfg.globalMaxFailed, value: '' });
  if (nip) scopes.push({ key: hashKey_('N:', nip), label: 'nip', limit: cfg.maxFailed, value: nip });
  return scopes;
}

function isThrottled_(scopes) {
  if (!scopes.length) return false;
  const counts = CacheService.getScriptCache().getAll(scopes.map(function (s) { return s.key; }));
  return scopes.some(function (s) { return Number(counts[s.key] || 0) >= s.limit; });
}

/** Increments every scope under the lock and logs the moment a scope trips (once per window). */
function recordFailure_(scopes, actor) {
  if (!scopes.length) return;
  const cache = CacheService.getScriptCache();
  const ttl = Math.min(getConfig_().lockMinutes * 60, MAX_CACHE_TTL_SECONDS);
  const keys = scopes.map(function (s) { return s.key; });
  const tripped = [];
  withLock_(function () {
    const counts = cache.getAll(keys);
    const updates = {};
    scopes.forEach(function (s) {
      const n = Number(counts[s.key] || 0) + 1;
      updates[s.key] = String(n);
      if (n === s.limit) tripped.push(s);
    });
    cache.putAll(updates, ttl);
  }, WEB_LOCK_WAIT_MS);
  appendLogRows_(tripped.map(function (s) {
    return buildLogRow_(actor, 'getCdpStatus', '', 'lockout:' + s.label, '', s.value, 'THROTTLE_TRIGGERED');
  }));
}
