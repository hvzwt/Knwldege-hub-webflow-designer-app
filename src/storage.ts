import type { CodeRecord, Hub, Notes } from './types';

/**
 * Everything is kept in this browser's localStorage, per site. Storage can be
 * blocked in some browsers, so every read and write is guarded and the app
 * works without it.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the hub still works for this session */
  }
}

export interface Settings {
  deepScan: boolean;
  proxyUrl: string;
  token: string;
  rememberToken: boolean;
}

const DEFAULT_SETTINGS: Settings = { deepScan: true, proxyUrl: '', token: '', rememberToken: false };

export const store = {
  settings(siteId: string): Settings {
    return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(`kh:settings:${siteId}`, {}) };
  },
  saveSettings(siteId: string, s: Settings): void {
    write(`kh:settings:${siteId}`, s.rememberToken ? s : { ...s, token: '' });
  },
  notes(siteId: string): Notes {
    return read<Notes>(`kh:notes:${siteId}`, {});
  },
  saveNotes(siteId: string, notes: Notes): void {
    write(`kh:notes:${siteId}`, notes);
  },
  manualCode(siteId: string): CodeRecord[] {
    return read<CodeRecord[]>(`kh:code:${siteId}`, []);
  },
  saveManualCode(siteId: string, rows: CodeRecord[]): void {
    write(`kh:code:${siteId}`, rows);
  },
  lastHub(siteId: string): Hub | null {
    return read<Hub | null>(`kh:hub:${siteId}`, null);
  },
  saveHub(siteId: string, hub: Hub): void {
    write(`kh:hub:${siteId}`, hub);
  },
};
