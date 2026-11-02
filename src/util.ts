/**
 * Run a Designer API call and fall back instead of throwing. The Designer API
 * differs between plans, modes and API versions, and one unreadable element
 * must never stop the whole hub from building.
 */
export async function safe<T>(fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    const value = await fn();
    return value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

/** True when `obj[key]` is a callable method. */
export function has<K extends string>(obj: unknown, key: K): obj is Record<K, (...args: never[]) => unknown> {
  return !!obj && typeof (obj as Record<string, unknown>)[key] === 'function';
}

/** Map with at most `limit` promises in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function joinPath(...parts: string[]): string {
  const p = parts.filter(Boolean).join('/').replace(/\/+/g, '/');
  return p.startsWith('/') ? p : `/${p}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** "Navbar, Button (x8), Footer" */
export function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([name, n]) => (n > 1 ? `${name} (x${n})` : name))
    .join(', ');
}

export function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.innerText === 'string') return o.innerText;
    if (typeof o.src === 'string') return o.src;
    if ('mode' in o) {
      const to = o.to;
      if (typeof to === 'string') return to;
      if (to && typeof to === 'object') return Object.values(to as object).join(' ');
      return String(o.mode);
    }
  }
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}
