import { collectionSteps, fieldGuidance, fieldMapping, fieldTypeLabel } from '../guide/fieldGuide';
import { componentLabel, PROP_TYPE_LABEL } from '../scan/components';
import type { CodeRecord, ComponentRecord, Hub, Notes, PageRecord } from '../types';
import { formatCounts, pluralize, uniq } from '../util';

export interface Table {
  id: 'pages' | 'collections' | 'cms' | 'components' | 'code';
  title: string;
  /** Matches the tab names of the handover sheet. */
  sheetName: string;
  columns: string[];
  /** Column widths in characters, for the spreadsheet export. */
  widths: number[];
  rows: Array<{ key: string; cells: string[]; group?: string }>;
}

export interface Summary {
  staticPages: number;
  cmsTemplates: number;
  dynamicPages: number | null;
  utilityPages: number;
  draftPages: number;
  otherPages: number;
  totalPages: number;
  folders: number;
  collections: number;
  items: number | null;
  components: number;
  componentInstances: number;
  forms: number;
}

const NOTE_SEP = ' · ';

export function pageTypeLabel(p: PageRecord): string {
  const folder = p.folder ? ` (${p.folder} folder)` : '';
  if (p.isDraft) return `Draft${folder}`;
  switch (p.category) {
    case 'cmsTemplate':
      return 'CMS Template';
    case 'utility':
      return 'Utility';
    case 'ecommerce':
      return 'Ecommerce';
    case 'userAccount':
      return 'User account';
    case 'staticTemplate':
      return `Page template${folder}`;
    default:
      return `Static${p.isHome ? ' (home page)' : folder}`;
  }
}

export function isLivePage(p: PageRecord): boolean {
  return !p.isDraft && (p.category === 'static' || p.category === 'ecommerce' || p.category === 'userAccount');
}

export function summarize(hub: Hub): Summary {
  const live = hub.pages.filter((p) => !p.isDraft);
  const templates = hub.pages.filter((p) => p.category === 'cmsTemplate');
  const counted = hub.collections.filter((c) => c.itemCount !== null);
  // Dynamic pages = one page per item in every collection whose template page is published.
  const withPages = templates.filter((t) => !t.isDraft).map((t) => hub.collections.find((c) => c.id === t.collectionId));
  const dynamic = withPages.every((c) => c && c.itemCount !== null)
    ? withPages.reduce((n, c) => n + (c!.liveItemCount ?? c!.itemCount ?? 0), 0)
    : null;
  const forms = hub.code.filter((c) => c.kind === 'form').length;
  return {
    staticPages: live.filter((p) => p.category === 'static').length,
    cmsTemplates: templates.length,
    dynamicPages: dynamic,
    utilityPages: hub.pages.filter((p) => p.category === 'utility').length,
    draftPages: hub.pages.filter((p) => p.isDraft && p.category !== 'cmsTemplate').length,
    otherPages: live.filter((p) => p.category === 'ecommerce' || p.category === 'userAccount' || p.category === 'staticTemplate').length,
    totalPages: hub.pages.length,
    folders: new Set(hub.pages.map((p) => p.folder).filter(Boolean)).size,
    collections: hub.collections.length,
    items: counted.length ? counted.reduce((n, c) => n + (c.itemCount ?? 0), 0) : null,
    components: hub.components.length,
    componentInstances: hub.components.reduce((n, c) => n + (c.instanceCount ?? 0), 0),
    forms,
  };
}

/** Which components and pages link to a page. Only meaningful after a full scan. */
export function inboundLinks(hub: Hub, page: PageRecord): { components: string[]; pages: number } {
  const matches = (ids: string[], paths: string[]) => ids.includes(page.id) || paths.includes(page.path.replace(/\/$/, '') || '/');
  const components = hub.components.filter((c) => matches(c.linksTo, c.linkPaths)).map((c) => c.name);
  const viaComponent = new Set(components);
  let pages = 0;
  for (const other of hub.pages) {
    if (other.id === page.id || !other.scan) continue;
    if (!matches(other.scan.linksTo, other.scan.linkPaths)) continue;
    // Skip pages whose only link comes from a shared component already counted.
    const fromComponentsOnly = Object.keys(other.scan.components).some((n) => viaComponent.has(n));
    if (!fromComponentsOnly || !viaComponent.size) pages++;
  }
  return { components, pages };
}

export function pageNotes(hub: Hub, p: PageRecord): { orphan: string; notes: string[] } {
  const notes: string[] = [];
  let orphan = 'N/A';
  if (p.isDraft) orphan = 'N/A (draft)';
  else if (p.category === 'static' && hub.sources.canvas) {
    const inbound = inboundLinks(hub, p);
    const isOrphan = !p.isHome && !inbound.components.length && !inbound.pages;
    orphan = p.isHome ? 'No' : isOrphan ? 'Yes' : 'No';
    if (p.isHome) notes.push('Home page');
    else if (isOrphan) notes.push('Not linked from the navigation, footer or any other page – add a link if visitors should find it');
    else {
      const bits = [];
      if (inbound.components.length) bits.push(`Linked in ${inbound.components.join(' and ')}`);
      if (inbound.pages) bits.push(`linked from ${pluralize(inbound.pages, 'page')}`);
      notes.push(bits.join(', '));
    }
  } else if (p.category === 'static') {
    orphan = 'Run a full scan';
  }

  if (!p.isDraft && p.category !== 'utility') {
    if (!p.seoDescription && p.category !== 'cmsTemplate') notes.push('Meta description missing');
    if (p.seoTitle && p.name && !p.isHome && p.category === 'static' && !p.seoTitle.toLowerCase().includes(p.name.toLowerCase().slice(0, 6))) notes.push('SEO title differs from page name');
    if (/component|style ?guide|sample|test|demo/i.test(`${p.name} ${p.slug}`) && p.category === 'static') notes.push('Looks like an internal page. It is published and indexable – consider setting it to draft');
  }
  if (p.category === 'cmsTemplate') {
    const c = hub.collections.find((x) => x.id === p.collectionId);
    const empty = p.scan && !p.scan.error && !Object.keys(p.scan.components).length && !p.scan.bindings.length;
    if (empty && !p.isDraft) notes.push('Blank template still publishes item pages. Consider turning off collection pages');
    else if (empty) notes.push('Template not built yet');
    if (c?.listedOn.length) notes.push(`Items shown on ${uniq(c.listedOn.map((l) => l.split(' (')[0])).join(', ')}`);
  }
  if (p.isPasswordProtected) notes.push('Password protected');
  if (p.excludedFromSearch) notes.push('Excluded from Webflow site search');
  if (p.scan?.error) notes.push(`Could not read the canvas: ${p.scan.error}`);
  return { orphan, notes };
}

function indexedLabel(p: PageRecord): string {
  if (p.isDraft) return 'No – draft';
  if (p.category === 'utility') return 'No – utility page';
  if (p.isPasswordProtected) return 'No – password protected';
  if (p.category === 'cmsTemplate') return 'Yes – each published item';
  return 'Yes – included by default';
}

function withNote(base: string, notes: Notes, key: string): string {
  const extra = notes[key]?.trim();
  return extra ? (base ? `${base}${NOTE_SEP}${extra}` : extra) : base;
}

export function pagesTable(hub: Hub, notes: Notes): Table {
  const pageCode = new Map<string, string[]>();
  for (const c of hub.code) if (c.kind === 'script' || c.kind === 'embed') {
    for (const p of hub.pages) if (c.location === p.name) pageCode.set(p.id, [...(pageCode.get(p.id) ?? []), c.name]);
  }
  const siteScripts = hub.code.filter((c) => c.kind === 'script' && c.location.startsWith('Site-wide') && !c.location.includes('not applied'));
  return {
    id: 'pages',
    title: 'Page Inventory & SEO',
    sheetName: 'Page Inventory & SEO',
    columns: ['URL', 'Page Title', 'Page Type', 'CMS Collection Name', 'SEO Title', 'SEO Meta Description', 'Components Used', 'Forms Present?', 'Custom Code Present?', 'Existing Redirects (301)', 'Indexed? (sitemap indexing setting)', 'Orphan pages', 'Notes'],
    widths: [42, 26, 22, 24, 30, 50, 50, 28, 34, 22, 24, 12, 60],
    rows: hub.pages.map((p) => {
      const scan = p.scan;
      const cms = p.category === 'cmsTemplate'
        ? p.collectionName ?? ''
        : scan?.collectionLists.length ? `${scan.collectionLists.join(', ')} (${scan.collectionLists.length > 1 ? 'lists' : 'list'})` : '';
      const forms = scan ? (scan.forms.length ? `Yes – ${uniq(scan.forms.map((f) => `${f.insideComponent ? `${f.insideComponent} ` : ''}${f.name}`)).join(', ')}` : 'No') : 'Run a full scan';
      const code = pageCode.get(p.id) ?? [];
      const codeLabel = code.length ? `Yes – ${code.join(', ')}` : siteScripts.length ? 'No (site-wide code only)' : scan ? 'No embeds found' : '';
      const { orphan, notes: n } = pageNotes(hub, p);
      return {
        key: p.id,
        group: pageTypeLabel(p).split(' (')[0],
        cells: [
          p.url ?? p.path,
          p.name,
          pageTypeLabel(p),
          cms,
          p.category === 'cmsTemplate' && !p.seoTitle ? '(not set)' : p.seoTitle || '(not set)',
          p.seoDescription || '(not set)',
          scan ? formatCounts(scan.components) || 'None' : 'Run a full scan',
          forms,
          codeLabel,
          'Check Site settings › Publishing',
          indexedLabel(p),
          orphan,
          withNote(n.filter(Boolean).join('. '), notes, `pages:${p.id}`),
        ],
      };
    }),
  };
}

export function collectionsTable(hub: Hub, notes: Notes): Table {
  return {
    id: 'collections',
    title: 'CMS Collections',
    sheetName: 'CMS Collections',
    columns: ['Collection Name', 'Slug', 'Items', 'Template Page', 'Shown On', 'Fields', 'How to add content', 'Notes'],
    widths: [24, 22, 10, 34, 50, 10, 90, 40],
    rows: hub.collections.map((c) => ({
      key: c.id,
      cells: [
        c.name,
        c.slug,
        c.itemCount === null ? 'Unknown' : c.liveItemCount !== null && c.liveItemCount !== c.itemCount ? `${c.itemCount} (${c.liveItemCount} live)` : String(c.itemCount),
        c.templatePath ? `${c.templatePath}${c.templatePublished ? '' : ' (not published)'}` : 'No template page',
        c.listedOn.join('; ') || '—',
        String(c.fields.length),
        collectionSteps(c).map((s, i) => `${i + 1}. ${s}`).join('\n'),
        withNote(c.source === 'dataApi' ? '' : 'Field list read from the canvas; connect the Data API for every field, required flags and help text', notes, `collections:${c.id}`),
      ],
    })),
  };
}

export function cmsTable(hub: Hub, notes: Notes): Table {
  const rows: Table['rows'] = [];
  for (const c of hub.collections) {
    const template = hub.pages.find((p) => p.id === c.templatePageId);
    for (const f of c.fields) {
      const g = fieldGuidance(f, c);
      rows.push({
        key: `${c.id}:${f.id}`,
        group: c.name,
        cells: [
          c.name,
          f.slug === 'name' && !/\(name\)/.test(f.name) && f.name.toLowerCase() !== 'name' ? `${f.name} (name)` : f.name,
          fieldTypeLabel(f),
          f.required === null ? (f.slug === 'name' || f.type === 'slug' ? 'Yes' : '—') : f.required ? 'Yes' : 'No',
          fieldMapping(f, c, template),
          withNote(g.note, notes, `cms:${c.id}:${f.id}`),
          g.helper,
        ],
      });
    }
  }
  return {
    id: 'cms',
    title: 'CMS Field Mapping',
    sheetName: 'CMS Field Mapping',
    columns: ['Collection Name', 'Field Name', 'Field Type', 'Required?', 'Mapped To (Page Element)', 'Notes for Marketing Editors', 'Helper Text'],
    widths: [22, 26, 34, 10, 44, 44, 70],
    rows,
  };
}

export function formatProps(c: ComponentRecord): string {
  if (!c.props.length) return c.variants.length ? `Variant (${c.variants.join(', ')})` : 'None';
  const parts = c.props.map((p) => {
    const label = p.type === 'variant' && c.variants.length ? `Variant (${c.variants.join(' / ')})` : p.name;
    const prefix = p.group ? `${p.group}: ` : '';
    const type = PROP_TYPE_LABEL[p.type] && p.type !== 'variant' ? ` [${PROP_TYPE_LABEL[p.type]}]` : '';
    return `${prefix}${label}${type}`;
  });
  if (c.variants.length && !c.props.some((p) => p.type === 'variant')) parts.unshift(`Variant (${c.variants.join(' / ')})`);
  return parts.join('; ');
}

function componentPurpose(c: ComponentRecord): string {
  if (c.description) return c.description;
  const slots = c.props.filter((p) => p.type === 'slot').map((p) => p.name);
  const bits = [];
  if (/nav|header/i.test(c.name)) bits.push('Global header');
  else if (/footer/i.test(c.name)) bits.push('Global footer');
  else if (/global ?styles?/i.test(c.name)) bits.push('Site-wide CSS/variables wrapper; keep it at the top of every page');
  if (slots.length) bits.push(`Holds other components in its slot${slots.length > 1 ? 's' : ''} (${slots.join(', ')})`);
  if (c.nestedIn.length) bits.push(`Used inside ${c.nestedIn.join(', ')}`);
  if (c.isCodeComponent) bits.push('Code component (React)');
  if (c.fromLibrary) bits.push(`From the ${c.fromLibrary} library`);
  return bits.join('. ') || '(no description – add one in the component settings)';
}

export function componentsTable(hub: Hub, notes: Notes): Table {
  return {
    id: 'components',
    title: 'Component Inventory',
    sheetName: 'Component Inventory',
    columns: ['Component Name', 'Purpose', 'Pages Used On', 'Props', 'Notes'],
    widths: [30, 50, 60, 70, 40],
    rows: hub.components.map((c) => {
      const count = c.instanceCount !== null ? ` (${c.instanceCount} ${c.instanceCount === 1 ? 'instance' : 'instances'})` : '';
      let usedOn = c.usedOn.join(', ');
      if (!usedOn && c.nestedIn.length) usedOn = `Inside ${c.nestedIn.join(', ')}`;
      if (!usedOn) usedOn = hub.sources.canvas ? (c.instanceCount ? 'Not found on any page (may be inside another component)' : 'Not used') : 'Run a full scan';
      return {
        key: c.id,
        group: c.group || 'Ungrouped',
        cells: [componentLabel(c), componentPurpose(c), `${usedOn}${count}`, formatProps(c), withNote('', notes, `components:${c.id}`)],
      };
    }),
  };
}

export function codeTable(hub: Hub, notes: Notes, manual: CodeRecord[]): Table {
  const all = [...hub.code, ...manual];
  const order = { script: 0, embed: 1, form: 2, external: 3, manual: 4 } as const;
  all.sort((a, b) => order[a.kind] - order[b.kind]);
  return {
    id: 'code',
    title: 'Custom Code & Forms',
    sheetName: 'Custom Code & Forms',
    columns: ['Page/Location', 'Code or Form Name', 'Purpose / Function', 'Notes'],
    widths: [40, 40, 70, 60],
    rows: all.map((c) => ({
      key: `${c.kind}:${c.location}:${c.name}`,
      group: { script: 'Scripts', embed: 'Embeds', form: 'Forms', external: 'External systems', manual: 'Added by hand' }[c.kind],
      cells: [c.location, c.name, c.purpose, withNote(c.notes, notes, `code:${c.kind}:${c.location}:${c.name}`)],
    })),
  };
}

export function allTables(hub: Hub, notes: Notes, manual: CodeRecord[]): Table[] {
  return [pagesTable(hub, notes), collectionsTable(hub, notes), cmsTable(hub, notes), componentsTable(hub, notes), codeTable(hub, notes, manual)];
}

/** Things worth fixing before handover, shown on the overview. */
export function findings(hub: Hub): string[] {
  const out: string[] = [];
  const live = hub.pages.filter((p) => !p.isDraft && p.category === 'static');
  const noDesc = live.filter((p) => !p.seoDescription);
  if (noDesc.length) out.push(`${pluralize(noDesc.length, 'live page')} without a meta description: ${noDesc.map((p) => p.name).join(', ')}`);
  if (hub.sources.canvas) {
    const orphans = live.filter((p) => pageNotes(hub, p).orphan === 'Yes');
    if (orphans.length) out.push(`${pluralize(orphans.length, 'page')} not linked from anywhere: ${orphans.map((p) => p.name).join(', ')}`);
    const blank = hub.pages.filter((p) => p.category === 'cmsTemplate' && !p.isDraft && p.scan && !p.scan.error && !Object.keys(p.scan.components).length && !p.scan.bindings.length);
    if (blank.length) out.push(`${pluralize(blank.length, 'blank CMS template')} still publish item pages: ${blank.map((p) => p.name).join(', ')}`);
  }
  const internal = live.filter((p) => /component|style ?guide|sample|test|demo/i.test(`${p.name} ${p.slug}`));
  if (internal.length) out.push(`Internal-looking pages are published: ${internal.map((p) => p.name).join(', ')}`);
  const undocumented = hub.components.filter((c) => !c.description && !c.fromLibrary);
  if (undocumented.length) out.push(`${pluralize(undocumented.length, 'component')} without a description in the component settings`);
  const noHelp = hub.collections.flatMap((c) => c.fields.filter((f) => c.source === 'dataApi' && !f.helpText && f.slug !== 'slug' && f.slug !== 'name'));
  if (noHelp.length) out.push(`${pluralize(noHelp.length, 'CMS field')} without help text. Suggested help text is in the CMS Field Mapping tab`);
  const empty = hub.collections.filter((c) => c.itemCount === 0);
  if (empty.length) out.push(`Empty collections: ${empty.map((c) => c.name).join(', ')}`);
  return out;
}
