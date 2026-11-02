import { useMemo, useState } from 'preact/hooks';
import type { Table } from '../report/tables';
import type { Notes } from '../types';

interface Props {
  table: Table;
  notes: Notes;
  onNote: (key: string, value: string) => void;
  /** Column indexes shown on the collapsed row: [title, subtitle, ...badges]. */
  summary: { title: number; subtitle?: number; badges?: number[] };
  /** Columns hidden from the expanded detail (already in the summary). */
  hideInDetail?: number[];
  empty?: string;
}

export function TableView({ table, notes, onNote, summary, hideInDetail = [], empty }: Props) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('All');
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of table.rows) if (r.group) counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
    return [...counts.entries()];
  }, [table]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return table.rows.filter((r) => (group === 'All' || r.group === group) && (!q || r.cells.some((c) => c.toLowerCase().includes(q))));
  }, [table, query, group]);

  return (
    <div class="tv">
      <div class="tv-bar">
        <input class="search" type="search" placeholder={`Search ${table.title.toLowerCase()}`} value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        <span class="muted small">{rows.length} of {table.rows.length}</span>
      </div>
      {groups.length > 1 && (
        <div class="chips">
          {[['All', table.rows.length] as [string, number], ...groups].map(([g, n]) => (
            <button key={g} class={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
              {g} <span>{n}</span>
            </button>
          ))}
        </div>
      )}
      {!rows.length && <p class="muted pad">{empty ?? 'Nothing matches.'}</p>}
      <ul class="rows">
        {rows.map((r) => {
          const isOpen = open === r.key;
          const noteKey = `${table.id}:${r.key}`;
          return (
            <li key={r.key} class={isOpen ? 'open' : ''}>
              <button class="row-head" onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen}>
                <span class="row-title">
                  <b>{r.cells[summary.title]}</b>
                  {summary.subtitle !== undefined && <span class="muted mono">{r.cells[summary.subtitle]}</span>}
                </span>
                <span class="badges">
                  {summary.badges?.map((i) => r.cells[i] && <span key={i} class="badge">{r.cells[i]}</span>)}
                  {notes[noteKey] && <span class="badge note">Note</span>}
                </span>
                <span class="caret">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div class="row-body">
                  <dl>
                    {table.columns.map((c, i) =>
                      hideInDetail.includes(i) || !r.cells[i] ? null : (
                        <div key={c}>
                          <dt>{c}</dt>
                          <dd>{linkify(r.cells[i])}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                  <label class="note-edit">
                    <span>Your note (included in exports)</span>
                    <textarea rows={2} value={notes[noteKey] ?? ''} placeholder="Add context for the client or the next developer" onInput={(e) => onNote(noteKey, (e.target as HTMLTextAreaElement).value)} />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function linkify(text: string) {
  if (/^https?:\/\/\S+$/.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer">
        {text}
      </a>
    );
  }
  return text.split('\n').map((line, i) => (
    <span key={i} class="line">
      {line}
    </span>
  ));
}
