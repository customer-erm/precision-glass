/**
 * Persistent user memory via localStorage.
 * Remembers returning customers so the agent can greet them by name,
 * skip redundant questions, and reference their last configuration.
 */

const STORAGE_KEY = 'precision-glass-user';

export type InteractionMode = 'voice' | 'chat' | 'browse';

export interface LastQuote {
  service?: 'showers' | 'railings' | 'commercial';
  enclosure?: string;
  glass?: string;
  hardware?: string;
  handle?: string;
  accessories?: string;
  extras?: string;
}

export interface StoredUser {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  timeline?: string;
  budget?: string;
  lastQuote?: LastQuote;
  preferredMode?: InteractionMode;
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
}

/* ------------------------------------------------------------------ */
/*  Load / save / clear                                                */
/* ------------------------------------------------------------------ */

export function loadUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StoredUser;
  } catch (err) {
    console.warn('[UserStorage] Failed to load:', err);
    return null;
  }
}

export function saveUser(partial: Partial<StoredUser>): StoredUser {
  const existing = loadUser();
  const now = new Date().toISOString();
  const merged: StoredUser = {
    ...(existing || { visitCount: 0, firstVisit: now, lastVisit: now }),
    ...partial,
    // Keep monotonic counters correct
    visitCount: partial.visitCount ?? existing?.visitCount ?? 0,
    firstVisit: existing?.firstVisit || now,
    lastVisit: now,
    // Merge lastQuote fields instead of replacing wholesale
    lastQuote: partial.lastQuote
      ? { ...(existing?.lastQuote || {}), ...partial.lastQuote }
      : existing?.lastQuote,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    console.log('[UserStorage] Saved:', merged);
  } catch (err) {
    console.warn('[UserStorage] Failed to save:', err);
  }
  return merged;
}

/** Increment visit count once per page-load. Call on app init. */
export function registerVisit(): StoredUser | null {
  const existing = loadUser();
  if (!existing) return null;
  return saveUser({ visitCount: (existing.visitCount || 0) + 1 });
}

export function clearUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[UserStorage] Cleared');
  } catch (err) {
    console.warn('[UserStorage] Failed to clear:', err);
  }
}

export function isReturningUser(): boolean {
  const user = loadUser();
  return !!(user && user.visitCount > 0);
}

/* ------------------------------------------------------------------ */
/*  Summaries for prompt injection                                     */
/* ------------------------------------------------------------------ */

/** Compact one-paragraph description of what we know about this user. */
export function summarizeUser(user: StoredUser): string {
  const lines: string[] = [];
  if (user.name) lines.push(`Name: ${user.name}`);
  if (user.email) lines.push(`Email: ${user.email}`);
  if (user.phone) lines.push(`Phone: ${user.phone}`);
  if (user.location) lines.push(`Location: ${user.location}`);
  if (user.timeline) lines.push(`Timeline: ${user.timeline}`);
  if (user.budget) lines.push(`Budget: ${user.budget}`);
  if (user.lastQuote) {
    const q = user.lastQuote;
    const parts: string[] = [];
    if (q.service) parts.push(q.service);
    if (q.enclosure) parts.push(q.enclosure);
    if (q.glass) parts.push(q.glass);
    if (q.hardware) parts.push(q.hardware);
    if (q.handle) parts.push(q.handle);
    if (q.accessories) parts.push(q.accessories);
    if (q.extras && q.extras !== 'none') parts.push(`extras: ${q.extras}`);
    if (parts.length) lines.push(`Previous configuration: ${parts.join(', ')}`);
  }
  lines.push(`Visit #${user.visitCount + 1}`);
  return lines.join('\n');
}
