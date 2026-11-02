import { useState } from 'preact/hooks';
import { copyText, download, fileSafe } from '../export/download';
import { toCsv, toHtml, toJson, toMarkdown, toTsv, toXlsx } from '../export/exporters';
import type { Table } from '../report/tables';
import { DataApi } from '../scan/dataApi';
import type { Settings } from '../storage';
import type { CodeRecord, Hub } from '../types';

export function ExportView({ hub, tables }: { hub: Hub; tables: Table[] }) {
  const [msg, setMsg] = useState('');
  const base = `${fileSafe(hub.site.name)}-knowledge-hub`;
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };
  const run = async (label: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      flash(label);
    } catch (err) {
      flash(`Could not export: ${(err as Error).message}`);
    }
  };

  return (
    <div class="export">
      <section class="panel">
        <h3>Download the Knowledge Hub</h3>
        <p class="muted small">Every export includes your notes and the rows you added by hand.</p>
        <div class="btns">
          <button class="btn primary" onClick={() => run('Spreadsheet downloaded', async () => download(`${base}.xlsx`, await toXlsx(hub, tables)))}>
            Spreadsheet (.xlsx)
          </button>
          <button class="btn" onClick={() => run('Handbook downloaded', () => download(`${base}.html`, toHtml(hub, tables), 'text/html'))}>
            Client handbook (.html)
          </button>
          <button class="btn" onClick={() => run('Markdown downloaded', () => download(`${base}.md`, toMarkdown(hub, tables), 'text/markdown'))}>
            Markdown (.md)
          </button>
          <button class="btn" onClick={() => run('JSON downloaded', () => download(`${base}.json`, toJson(hub), 'application/json'))}>
            Raw data (.json)
          </button>
        </div>
        <p class="muted small">The spreadsheet has the same tabs as the handover sheet: Overview, Page Inventory &amp; SEO, CMS Collections, CMS Field Mapping, Component Inventory, Custom Code &amp; Forms. The handbook opens in any browser and prints to PDF.</p>
      </section>
      <section class="panel">
        <h3>Paste into Google Sheets</h3>
        <p class="muted small">Copy a tab, click cell A1 of an empty sheet and paste.</p>
        <div class="btns">
          {tables.map((t) => (
            <button key={t.id} class="btn" onClick={() => run(`${t.title} copied`, async () => {
              if (!(await copyText(toTsv(t)))) throw new Error('the clipboard is blocked here; use the CSV download');
            })}>
              Copy {t.title}
            </button>
          ))}
        </div>
        <details>
          <summary class="small">CSV files</summary>
          <div class="btns">
            {tables.map((t) => (
              <button key={t.id} class="btn ghost" onClick={() => run('CSV downloaded', () => download(`${base}-${t.id}.csv`, toCsv(t), 'text/csv'))}>
                {t.title}.csv
              </button>
            ))}
          </div>
        </details>
      </section>
      {msg && <div class="toast">{msg}</div>}
    </div>
  );
}

export function SettingsView({ siteId, settings, onChange }: { siteId: string; settings: Settings; onChange: (s: Settings) => void }) {
  const [status, setStatus] = useState('');
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const test = async () => {
    setStatus('Checking…');
    try {
      const name = await new DataApi(settings.proxyUrl, settings.token).test(siteId);
      setStatus(`Connected to ${name}`);
    } catch (err) {
      setStatus(`Not connected: ${(err as Error).message}`);
    }
  };
  return (
    <div class="settings">
      <section class="panel">
        <h3>Scan</h3>
        <label class="check">
          <input type="checkbox" checked={settings.deepScan} onChange={(e) => set({ deepScan: (e.target as HTMLInputElement).checked })} />
          <span>
            <b>Full scan (recommended)</b>
            <span class="muted small block">Opens every page in the canvas to find components, forms, Collection Lists, CMS bindings and links. The Designer jumps between pages while it runs and returns to your page at the end.</span>
          </span>
        </label>
      </section>
      <section class="panel">
        <h3>Webflow Data API (optional)</h3>
        <p class="muted small">
          The Designer can't read every CMS field, item counts for collections that aren't on a page, or site scripts. Add a read-only site token and the proxy from this project's <code>proxy/</code> folder to include them.
        </p>
        <label class="field">
          <span>Proxy URL</span>
          <input value={settings.proxyUrl} placeholder="https://knowledge-hub-proxy.your-account.workers.dev" onInput={(e) => set({ proxyUrl: (e.target as HTMLInputElement).value.trim() })} />
        </label>
        <label class="field">
          <span>Site API token (read-only scopes: sites, pages, cms, custom_code, forms)</span>
          <input type="password" value={settings.token} placeholder="Paste the token" onInput={(e) => set({ token: (e.target as HTMLInputElement).value.trim() })} />
        </label>
        <label class="check">
          <input type="checkbox" checked={settings.rememberToken} onChange={(e) => set({ rememberToken: (e.target as HTMLInputElement).checked })} />
          <span class="small">Remember the token in this browser</span>
        </label>
        <div class="btns">
          <button class="btn" disabled={!settings.proxyUrl || !settings.token} onClick={test}>
            Test connection
          </button>
          {status && <span class="small">{status}</span>}
        </div>
      </section>
    </div>
  );
}

export function ManualCodeForm({ rows, onChange }: { rows: CodeRecord[]; onChange: (rows: CodeRecord[]) => void }) {
  const blank = { location: '', name: '', purpose: '', notes: '' };
  const [draft, setDraft] = useState(blank);
  const field = (k: keyof typeof blank, label: string, placeholder: string) => (
    <label class="field">
      <span>{label}</span>
      <input value={draft[k]} placeholder={placeholder} onInput={(e) => setDraft({ ...draft, [k]: (e.target as HTMLInputElement).value })} />
    </label>
  );
  return (
    <details class="panel">
      <summary>
        <b>Add code the scan can't see</b> <span class="muted small">({rows.length} added)</span>
      </summary>
      <p class="muted small">Code pasted into Site settings or Page settings › Custom code isn't readable by any Webflow API. Add it here so it's in the handover.</p>
      <div class="grid2">
        {field('location', 'Page / location', 'Site-wide – Footer code')}
        {field('name', 'Code or form name', 'Cookie banner')}
        {field('purpose', 'Purpose / function', 'Loads the consent banner')}
        {field('notes', 'Notes', 'Managed by the client in Cookiebot')}
      </div>
      <div class="btns">
        <button class="btn" disabled={!draft.name.trim()} onClick={() => {
          onChange([...rows, { ...draft, kind: 'manual' }]);
          setDraft(blank);
        }}>
          Add row
        </button>
      </div>
      {rows.length > 0 && (
        <ul class="manual">
          {rows.map((r, i) => (
            <li key={i}>
              <span>
                <b>{r.name}</b> <span class="muted small">{r.location}</span>
              </span>
              <button class="btn ghost small" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
