import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { allTables } from '../report/tables';
import { buildHub } from '../scan';
import { store, type Settings } from '../storage';
import type { CodeRecord, Hub, Notes } from '../types';
import { CmsView } from './CmsView';
import { Overview } from './Overview';
import { ExportView, ManualCodeForm, SettingsView } from './Panels';
import { TableView } from './TableView';

const TABS = [
  ['overview', 'Overview'],
  ['pages', 'Pages'],
  ['cms', 'CMS'],
  ['components', 'Components'],
  ['code', 'Code & Forms'],
  ['export', 'Export'],
  ['settings', 'Settings'],
] as const;
type Tab = (typeof TABS)[number][0];

interface Props {
  siteId: string;
  siteName: string;
  /** Used outside the Designer (local preview) to show sample data. */
  demoHub?: Hub;
}

export function App({ siteId, siteName, demoHub }: Props) {
  const [hub, setHub] = useState<Hub | null>(() => demoHub ?? store.lastHub(siteId));
  const [tab, setTab] = useState<Tab>('overview');
  // Which page-type chip the Pages tab opens with; bumping `nav` remounts it.
  const [pagesGroup, setPagesGroup] = useState<{ group?: string; nav: number }>({ nav: 0 });
  const goTo = (t: Tab, group?: string) => {
    if (t === 'pages') setPagesGroup((g) => ({ group, nav: g.nav + 1 }));
    setTab(t);
  };
  const [settings, setSettings] = useState<Settings>(() => store.settings(siteId));
  const [notes, setNotes] = useState<Notes>(() => store.notes(siteId));
  const [manual, setManual] = useState<CodeRecord[]>(() => store.manualCode(siteId));
  const [progress, setProgress] = useState<{ msg: string; done?: number; total?: number } | null>(null);
  const [error, setError] = useState('');
  const cancelled = useRef(false);

  useEffect(() => store.saveSettings(siteId, settings), [siteId, settings]);
  useEffect(() => store.saveManualCode(siteId, manual), [siteId, manual]);
  useEffect(() => {
    const t = setTimeout(() => store.saveNotes(siteId, notes), 300);
    return () => clearTimeout(t);
  }, [siteId, notes]);

  const tables = useMemo(() => (hub ? allTables(hub, notes, manual) : []), [hub, notes, manual]);
  const table = (id: string) => tables.find((t) => t.id === id)!;
  const onNote = (key: string, value: string) => setNotes((n) => {
    const next = { ...n };
    if (value.trim()) next[key] = value;
    else delete next[key];
    return next;
  });

  const generate = async () => {
    if (demoHub) return;
    cancelled.current = false;
    setError('');
    setProgress({ msg: 'Starting' });
    try {
      const result = await buildHub(
        {
          deepScan: settings.deepScan,
          dataApi: settings.proxyUrl && settings.token ? { proxyUrl: settings.proxyUrl, token: settings.token } : null,
        },
        (msg, done, total) => setProgress({ msg, done, total }),
        () => cancelled.current,
      );
      setHub(result);
      store.saveHub(siteId, result);
      setTab('overview');
      void webflow.notify({ type: 'Success', message: 'Knowledge Hub is ready' }).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message || 'The scan failed');
    } finally {
      setProgress(null);
    }
  };

  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;

  return (
    <div class="app">
      <header class="top">
        <div>
          <h1>Knowledge Hub</h1>
          <p class="muted small">{hub?.site.name ?? siteName}</p>
        </div>
        {progress ? (
          <button class="btn" onClick={() => (cancelled.current = true)}>
            Stop
          </button>
        ) : (
          <button class="btn primary" onClick={generate} disabled={!!demoHub}>
            {hub ? 'Refresh hub' : 'Create Knowledge Hub'}
          </button>
        )}
      </header>

      {progress && (
        <div class="progress" role="status">
          <div class="bar">
            <i style={{ width: `${pct ?? 15}%` }} class={pct === null ? 'indeterminate' : ''} />
          </div>
          <span class="small">
            {progress.msg}
            {progress.total ? ` (${progress.done ?? 0}/${progress.total})` : '…'}
          </span>
        </div>
      )}
      {error && <div class="alert">{error}</div>}
      {demoHub && <div class="alert info">Preview with sample data. Open the extension inside the Webflow Designer to document a real site.</div>}

      {!hub ? (
        <div class="empty">
          <h2>Document this whole site in one click</h2>
          <p class="muted">
            The Knowledge Hub lists every page (static, CMS templates and the dynamic pages they create), each CMS collection with its slug, item count and a step-by-step content-entry guide, every component with its props, and the custom code and forms on the site.
          </p>
          <p class="muted small">A full scan visits each page in the canvas, so the Designer will move between pages for a moment.</p>
          {!progress && (
            <button class="btn primary big" onClick={generate}>
              Create Knowledge Hub
            </button>
          )}
          <details class="empty-settings">
            <summary class="small">Scan settings</summary>
            <SettingsView siteId={siteId} settings={settings} onChange={setSettings} />
          </details>
        </div>
      ) : (
        <>
          <nav class="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} class={tab === id ? 'on' : ''} onClick={() => goTo(id)}>
                {label}
              </button>
            ))}
          </nav>
          <main class="content">
            {tab === 'overview' && <Overview hub={hub} onGo={(t, g) => goTo(t as Tab, g)} />}
            {tab === 'pages' && <TableView key={pagesGroup.nav} initialGroup={pagesGroup.group} table={table('pages')} notes={notes} onNote={onNote} summary={{ title: 1, subtitle: 0, badges: [2, 3] }} hideInDetail={[1]} />}
            {tab === 'cms' && <CmsView hub={hub} notes={notes} onNote={onNote} />}
            {tab === 'components' && <TableView table={table('components')} notes={notes} onNote={onNote} summary={{ title: 0 }} hideInDetail={[0]} empty="This site has no components yet." />}
            {tab === 'code' && (
              <>
                <ManualCodeForm rows={manual} onChange={setManual} />
                <TableView table={table('code')} notes={notes} onNote={onNote} summary={{ title: 1, subtitle: 0 }} hideInDetail={[1]} empty="No custom code or forms found." />
              </>
            )}
            {tab === 'export' && <ExportView hub={hub} tables={tables} />}
            {tab === 'settings' && <SettingsView siteId={hub.site.id} settings={settings} onChange={setSettings} />}
          </main>
        </>
      )}
    </div>
  );
}
