// Per-challenge drafts and panel state, kept in localStorage.
// Storage is best-effort: private browsing or a full quota must not break the editor.

const STORAGE_KEY = 'dfa-kitchen-v2';
const LEGACY_STORAGE_KEY = 'dfa-kitchen-v1';
const LEGACY_LAST_LEVEL = 2;  // the v1 build shipped three challenges

const clamp = (value, max) => Math.max(0, Math.min(max, value));

/**
 * Restores the last session, falling back to the single-machine v1 format and finally
 * to defaults. `machine` is the draft for the restored challenge, or null for none.
 */
export function loadSession(levels) {
  const session = {drafts: {}, levelIndex: 0, collapsed: false, machine: null};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      session.drafts = saved.drafts || {};
      session.levelIndex = clamp(saved.levelIndex || 0, levels.length - 1);
      session.collapsed = !!saved.collapsed;
      session.machine = session.drafts[levels[session.levelIndex].id] ?? null;
      return session;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy?.machine) {
      session.machine = legacy.machine;
      session.levelIndex = clamp(legacy.levelIndex || 0, LEGACY_LAST_LEVEL);
    }
  } catch {
    // Unreadable or unavailable storage simply means a fresh session.
  }
  return session;
}

/** Persists the session. Failure is silent: the in-memory session stays authoritative. */
export function saveSession({drafts, levelIndex, collapsed}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({drafts, levelIndex, collapsed}));
  } catch {
    // Out of quota or storage denied; nothing to recover from here.
  }
}
