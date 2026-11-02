import writeXlsxFile from 'write-excel-file';
import { collectionSteps } from '../guide/fieldGuide';
import { findings, summarize, type Summary, type Table } from '../report/tables';
import type { Hub } from '../types';

export function overviewRows(hub: Hub, s: Summary): Array<[string, string]> {
  const n = (v: number | null) => (v === null ? 'Unknown – connect the Data API or run a full scan' : String(v));
  return [
    ['Site', hub.site.name],
    ['Staging URL', hub.site.stagingUrl ?? ''],
    ['Live URL', hub.site.productionUrl ?? 'Not published to a custom domain'],
    ['Last published', hub.site.lastPublished ? new Date(hub.site.lastPublished).toLocaleString() : 'Never'],
    ['Knowledge Hub generated', new Date(hub.generatedAt).toLocaleString()],
    ['Static pages (live)', String(s.staticPages)],
    ['CMS template pages', String(s.cmsTemplates)],
    ['Dynamic (CMS item) pages', n(s.dynamicPages)],
    ['Utility pages (404, password…)', String(s.utilityPages)],
    ['Draft pages', String(s.draftPages)],
    ['Other pages (ecommerce, accounts, templates)', String(s.otherPages)],
    ['Page folders', String(s.folders)],
    ['CMS collections', String(s.collections)],
    ['CMS items (all collections)', n(s.items)],
    ['Components', String(s.components)],
    ['Component instances', String(s.componentInstances)],
    ['Forms', hub.sources.canvas || hub.sources.dataApi ? String(s.forms) : 'Run a full scan'],
  ];
}

export async function toXlsx(hub: Hub, tables: Table[]): Promise<Blob> {
  const s = summarize(hub);
  const bold = { fontWeight: 'bold' as const };
  const header = { fontWeight: 'bold' as const, backgroundColor: '#E8EEF9', wrap: true };
  const overview = [
    [{ value: `${hub.site.name} – Knowledge Hub`, fontWeight: 'bold' as const, fontSize: 16 }],
    [],
    ...overviewRows(hub, s).map(([k, v]) => [{ value: k, ...bold }, { value: v, wrap: true }]),
    [],
    [{ value: 'Worth fixing before handover', ...bold }],
    ...findings(hub).map((f) => [{ value: '•' }, { value: f, wrap: true }]),
    ...(hub.warnings.length ? [[], [{ value: 'Scan notes', ...bold }], ...hub.warnings.map((w) => [{ value: '•' }, { value: w, wrap: true }])] : []),
  ];
  const sheets = tables.map((t) => [
    t.columns.map((c) => ({ value: c, ...header })),
    ...t.rows.map((r) => r.cells.map((v) => ({ value: v, wrap: true, alignVertical: 'top' as const }))),
  ]);
  return writeXlsxFile([overview, ...sheets] as never, {
    sheets: ['Overview', ...tables.map((t) => t.sheetName.slice(0, 31))],
    columns: [[{ width: 38 }, { width: 90 }], ...tables.map((t) => t.widths.map((width) => ({ width })))],
    stickyRowsCount: 1,
  } as never) as unknown as Promise<Blob>;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (t: Table) => [t.columns, ...t.rows.map((r) => r.cells)].map((row) => row.map(csvCell).join(',')).join('\n');

/** Tab-separated, so it pastes straight into Google Sheets or Excel. */
export const toTsv = (t: Table) =>
  [t.columns, ...t.rows.map((r) => r.cells)].map((row) => row.map((v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t')).join('\n');

const mdCell = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
function mdTable(columns: string[], rows: string[][]): string {
  return [`| ${columns.map(mdCell).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`)].join('\n');
}

export function toMarkdown(hub: Hub, tables: Table[]): string {
  const s = summarize(hub);
  const out: string[] = [`# ${hub.site.name} – Knowledge Hub`, '', `_Generated ${new Date(hub.generatedAt).toLocaleString()}_`, '', '## Overview', '', mdTable(['', ''], overviewRows(hub, s))];
  const f = findings(hub);
  if (f.length) out.push('', '### Worth fixing before handover', '', ...f.map((x) => `- ${x}`));
  out.push('', '## How to add content', '');
  for (const c of hub.collections) {
    out.push(`### ${c.name}`, '', ...collectionSteps(c).map((st, i) => `${i + 1}. ${st}`), '');
  }
  for (const t of tables) out.push(`## ${t.title}`, '', mdTable(t.columns, t.rows.map((r) => r.cells)), '');
  return out.join('\n');
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A standalone handbook page the client can open, print or save as PDF. */
export function toHtml(hub: Hub, tables: Table[]): string {
  const s = summarize(hub);
  const stat = (label: string, v: number | null) => `<div class="stat"><b>${v ?? '—'}</b><span>${esc(label)}</span></div>`;
  const table = (t: Table) =>
    `<section id="${t.id}"><h2>${esc(t.title)}</h2><div class="scroll"><table><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows
      .map((r) => `<tr>${r.cells.map((c) => `<td>${esc(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div></section>`;
  const guides = hub.collections
    .map((c) => `<details><summary>${esc(c.name)} <small>${c.itemCount ?? '?'} items</small></summary><ol>${collectionSteps(c).map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>`)
    .join('');
  const f = findings(hub);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(hub.site.name)} – Knowledge Hub</title>
<style>
:root{--bg:#fff;--fg:#1d1f23;--muted:#5d6470;--line:#e3e6eb;--accent:#146ef5;--soft:#f4f7fc}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e9ebef;--muted:#a0a7b4;--line:#2c3038;--accent:#5b9bff;--soft:#1f2329}}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:1200px;margin:0 auto;padding:32px 16px 64px}h1{margin:0 0 4px;font-size:28px}h2{margin:40px 0 12px;font-size:20px}
.muted{color:var(--muted)}nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}nav a{color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:99px;padding:4px 12px;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.stat{background:var(--soft);border-radius:10px;padding:14px}.stat b{display:block;font-size:24px}.stat span{color:var(--muted);font-size:13px}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}th{background:var(--soft);position:sticky;top:0}
details{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0}summary{cursor:pointer;font-weight:600}summary small{color:var(--muted);font-weight:400;margin-left:6px}
ul.findings li{margin:4px 0}@media print{nav{display:none}.scroll{overflow:visible}details{break-inside:avoid}details:not([open]) ol{display:block}}
</style></head><body><main>
<h1>${esc(hub.site.name)} – Knowledge Hub</h1>
<p class="muted">${esc(hub.site.productionUrl ?? hub.site.stagingUrl ?? '')} · Generated ${esc(new Date(hub.generatedAt).toLocaleString())}</p>
<nav><a href="#overview">Overview</a><a href="#guide">How to add content</a>${tables.map((t) => `<a href="#${t.id}">${esc(t.title)}</a>`).join('')}</nav>
<section id="overview"><h2>Overview</h2><div class="stats">
${stat('Static pages', s.staticPages)}${stat('CMS templates', s.cmsTemplates)}${stat('Dynamic pages', s.dynamicPages)}${stat('Utility pages', s.utilityPages)}${stat('Draft pages', s.draftPages)}${stat('CMS collections', s.collections)}${stat('CMS items', s.items)}${stat('Components', s.components)}${stat('Forms', s.forms)}
</div>${f.length ? `<h3>Worth fixing before handover</h3><ul class="findings">${f.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>
<section id="guide"><h2>How to add content</h2>${guides || '<p class="muted">No CMS collections.</p>'}</section>
${tables.map(table).join('\n')}
</main></body></html>`;
}

export function toJson(hub: Hub): string {
  return JSON.stringify(hub, null, 2);
}
