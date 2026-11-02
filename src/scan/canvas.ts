import type { CmsBinding, CollectionField, FormUsage, PageRecord, PageScan } from '../types';
import { has, safe, uniq } from '../util';
import type { ComponentScan } from './components';
import { readForm } from './forms';
import { describeElement, linkValueToTarget, readLinkTarget, walkTree, type LinkTarget } from './walk';

/** What the canvas tells us about one collection. */
export interface DesignerCollection {
  id: string;
  name: string;
  itemCount: number | null;
  fields: CollectionField[];
  /** "Blog (newest first by publish-date, 9 per page)" */
  listedOn: string[];
}

export interface CanvasScan {
  pages: Map<string, PageScan>;
  collections: Map<string, DesignerCollection>;
  warnings: string[];
}

function ensureCollection(map: Map<string, DesignerCollection>, id: string, name?: string): DesignerCollection {
  let c = map.get(id);
  if (!c) {
    c = { id, name: name || id, itemCount: null, fields: [], listedOn: [] };
    map.set(id, c);
  } else if (name && c.name === c.id) {
    c.name = name;
  }
  return c;
}

function fieldFromAvailable(f: CollectionListAvailableField, collections: Map<string, DesignerCollection>): CollectionField {
  return {
    id: f.slug,
    name: f.displayName,
    slug: f.slug,
    type: f.fieldType,
    required: null,
    helpText: '',
    options: (f.options ?? []).map((o) => o.name),
    referenceCollection: f.referenceCollectionId ? collections.get(f.referenceCollectionId)?.name ?? f.referenceCollectionId : null,
    validations: {},
  };
}

function mergeFields(into: CollectionField[], extra: CollectionField[]): CollectionField[] {
  const byName = new Map(into.map((f) => [f.name.toLowerCase(), f]));
  for (const f of extra) {
    const existing = byName.get(f.name.toLowerCase());
    if (!existing) {
      into.push(f);
      byName.set(f.name.toLowerCase(), f);
    } else {
      if (!existing.options.length && f.options.length) existing.options = f.options;
      if (!existing.referenceCollection && f.referenceCollection) existing.referenceCollection = f.referenceCollection;
      if (existing.slug === existing.id && f.slug !== f.id) existing.slug = f.slug;
    }
  }
  return into;
}

function describeList(settings: CollectionListSettings, fields: CollectionField[]): string {
  const bits: string[] = [];
  const fieldName = (slug: string) => fields.find((f) => f.slug === slug)?.name ?? slug;
  if (settings.queryMode === 'curated') bits.push('hand-picked items');
  for (const s of settings.sort ?? []) {
    const f = fields.find((x) => x.slug === s.fieldSlug);
    const dir = f?.type === 'date'
      ? s.direction === 'descending' ? 'newest first' : 'oldest first'
      : s.direction === 'descending' ? 'Z→A / high→low' : 'A→Z / low→high';
    bits.push(`sorted by ${fieldName(s.fieldSlug)} (${dir})`);
  }
  for (const f of settings.filters ?? []) {
    const ff = f as unknown as { fieldSlug?: string; operator?: string };
    if (ff.fieldSlug) bits.push(`filtered by ${fieldName(ff.fieldSlug)}${ff.operator ? ` ${ff.operator}` : ''}`);
  }
  if (typeof settings.limit === 'number' && settings.limit > 0) bits.push(`shows ${settings.limit}`);
  if (settings.pagination?.itemsPerPage) bits.push(`${settings.pagination.itemsPerPage} per page`);
  return bits.join(', ');
}

async function readCollectionList(
  list: AnyElement,
  pageName: string,
  collections: Map<string, DesignerCollection>,
): Promise<string | null> {
  const dyn = list as DynamoWrapperElement;
  if (!has(dyn, 'getSettings')) return null;
  const settings = await safe(() => dyn.getSettings(), {} as CollectionListSettings);

  // Every Collection List can list all collections on the site. Use it to learn their names.
  if (has(dyn, 'searchAvailableSources')) {
    const sources = await safe(() => dyn.searchAvailableSources(), [] as CollectionListAvailableSource[]);
    for (const s of sources) if (!s.displayName.includes('→')) ensureCollection(collections, s.collectionId, s.displayName);
  }
  const id = settings.source?.collectionId;
  if (!id) return null;
  const col = ensureCollection(collections, id);

  if (has(dyn, 'searchAvailableFields')) {
    const fields = await safe(() => dyn.searchAvailableFields(), [] as CollectionListAvailableField[]);
    mergeFields(col.fields, fields.map((f) => fieldFromAvailable(f, collections)));
    // Reference fields let us count the referenced collection's items too.
    for (const f of fields) {
      if (!f.referenceCollectionId || !has(dyn, 'searchAvailableItems')) continue;
      const ref = ensureCollection(collections, f.referenceCollectionId);
      if (ref.itemCount !== null) continue;
      const res = await safe(() => dyn.searchAvailableItems({ fieldSlug: f.slug, pageSize: 1 }), null);
      if (res) ref.itemCount = res.total;
    }
  }
  if (col.itemCount === null && has(dyn, 'searchAvailableItems')) {
    const res = await safe(() => dyn.searchAvailableItems({ pageSize: 1 }), null);
    if (res) col.itemCount = res.total;
  }
  const how = describeList(settings, col.fields);
  col.listedOn = uniq([...col.listedOn, how ? `${pageName} (${how})` : pageName]);
  return col.name;
}

async function readBindings(
  root: AnyElement,
  bindable: AnyElement[],
  instances: ComponentElement[],
  page: PageRecord,
  collections: Map<string, DesignerCollection>,
  componentNames: Map<string, string>,
): Promise<CmsBinding[]> {
  const out: CmsBinding[] = [];
  const fieldById = new Map<string, { name: string; type: string }>();

  // The template's own collection fields, straight from the binding picker.
  if (page.collectionId && has(root, 'searchBindableSources')) {
    const sources = await safe(() => (root as unknown as BindableSourceSearch & { id: FullElementId }).searchBindableSources(), [] as BindableSource[]);
    const col = ensureCollection(collections, page.collectionId, page.collectionName ?? undefined);
    const fields: CollectionField[] = [];
    for (const s of sources) {
      if (s.sourceType !== 'cms') continue;
      fieldById.set(s.fieldId, { name: s.fieldName, type: s.fieldType });
      if (s.collectionId === page.collectionId && !fields.some((f) => f.id === s.fieldId)) {
        fields.push({ id: s.fieldId, name: s.fieldName, slug: s.fieldId, type: s.fieldType, required: null, helpText: '', options: [], referenceCollection: null, validations: {} });
      }
    }
    mergeFields(col.fields, fields);
  }

  for (const el of bindable) {
    if (!has(el, 'getSettings')) continue;
    const settings = await safe(() => (el as unknown as { getSettings(): Promise<Record<string, unknown>> }).getSettings(), {} as Record<string, unknown>);
    const type = (el as { type: string }).type;
    let tag = '';
    if (type === 'Heading' && typeof settings.headingTag === 'string') tag = settings.headingTag.toUpperCase();
    const bound = Object.entries(settings).filter(([, value]) => {
      const v = value as { sourceType?: string; fieldName?: string } | null;
      return !!v && v.sourceType === 'cms' && !!v.fieldName;
    });
    if (!bound.length) continue;
    const display = has(el, 'getDisplayName') ? await safe(() => (el as unknown as DisplayName & { id: FullElementId }).getDisplayName(), null) : null;
    for (const [key, value] of bound) {
      const v = value as { fieldName: string; fieldType?: string };
      const what = key === 'textContent' || key === 'children' ? tag : key === 'src' || key === 'image' ? '' : key;
      const label = describeElement(type, what || undefined);
      out.push({ fieldName: v.fieldName, fieldType: v.fieldType ?? '', element: display ? `${label} "${display}"` : label });
    }
  }

  for (const inst of instances) {
    if (!has(inst, 'getProps')) continue;
    const comp = await safe(() => inst.getComponent(), null);
    const compName = comp ? componentNames.get(comp.id) ?? 'Component' : 'Component';
    const props = await safe(() => inst.getProps(), [] as InstancePropSummary[]);
    const defs = comp && has(comp, 'getProps') ? await safe(() => comp.getProps(), [] as Prop[]) : [];
    for (const p of props) {
      const v = p.value as { sourceType?: string; fieldId?: string } | null;
      if (v && v.sourceType === 'cms' && v.fieldId) {
        const field = fieldById.get(v.fieldId);
        const propName = defs.find((d) => d.id === p.propId)?.name ?? 'prop';
        out.push({ fieldName: field?.name ?? v.fieldId, fieldType: field?.type ?? '', element: `${compName} → ${propName}` });
      }
    }
  }
  return out;
}

function addTarget(scan: PageScan, t: LinkTarget | null): void {
  if (!t) return;
  if (t.pageId) scan.linksTo.push(t.pageId);
  if (t.path) scan.linkPaths.push(t.path);
  if (t.url) scan.urls.push(t.url);
}

/**
 * Visit every page in the canvas. This switches the Designer to each page in
 * turn and returns to the page the user started on.
 */
export async function scanCanvas(
  pages: PageRecord[],
  comps: ComponentScan,
  progress: (msg: string, done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<CanvasScan> {
  const result: CanvasScan = { pages: new Map(), collections: new Map(), warnings: [] };
  const componentNames = new Map(comps.components.map((c) => [c.id, c.name]));
  const all = await safe(() => webflow.getAllPagesAndFolders(), [] as Array<Page | Folder>);
  const wfPages = new Map(all.filter((p): p is Page => p.type === 'Page').map((p) => [p.id, p]));
  const start = await safe(() => webflow.getCurrentPage(), null);
  let done = 0;

  try {
    for (const page of pages) {
      if (isCancelled()) {
        result.warnings.push('The page scan was stopped early, so some pages show no component or form details.');
        break;
      }
      progress(`Reading ${page.name}`, done, pages.length);
      const wf = wfPages.get(page.id);
      const scan: PageScan = { components: {}, forms: [], collectionLists: [], embeds: 0, bindings: [], linksTo: [], linkPaths: [], urls: [] };
      try {
        if (!wf) throw new Error('Page not found in the Designer');
        await webflow.switchPage(wf);
        const root = await webflow.getRootElement();
        if (!root) throw new Error('Page has no elements');
        const tree = await walkTree([root], { collectBindable: page.category === 'cmsTemplate' });

        for (const [id, n] of tree.instances) {
          const name = componentNames.get(id) ?? 'Unknown component';
          scan.components[name] = (scan.components[name] ?? 0) + n;
          // Forms that live inside components used here (e.g. a newsletter form in the Footer).
          for (const f of comps.forms.get(id) ?? []) scan.forms.push(f);
          for (const t of comps.links.get(id) ?? []) addTarget(scan, t);
        }
        const forms: FormUsage[] = await Promise.all(tree.forms.map((f) => readForm(f, null)));
        scan.forms.push(...forms);
        for (const list of tree.lists) {
          const name = await readCollectionList(list, page.name, result.collections);
          if (name) scan.collectionLists.push(name);
        }
        scan.collectionLists = uniq(scan.collectionLists);
        scan.embeds = tree.embeds;
        for (const link of tree.links) {
          addTarget(scan, await readLinkTarget(link));
        }
        for (const inst of tree.instanceElements) {
          const resolved = await safe(() => (has(inst, 'getResolvedProps') ? inst.getResolvedProps() : []), [] as ResolvedInstanceProp[]);
          for (const p of resolved) {
            addTarget(scan, linkValueToTarget(p.value));
          }
        }
        if (page.category === 'cmsTemplate') {
          scan.bindings = await readBindings(root, tree.bindable, tree.instanceElements, page, result.collections, componentNames);
        }
        scan.linksTo = uniq(scan.linksTo);
        scan.linkPaths = uniq(scan.linkPaths);
        scan.urls = uniq(scan.urls);
      } catch (err) {
        scan.error = err instanceof Error ? err.message : String(err);
      }
      result.pages.set(page.id, scan);
      done++;
    }
  } finally {
    if (start) await safe(() => webflow.switchPage(start), null);
  }
  progress('Pages read', done, pages.length);
  return result;
}
