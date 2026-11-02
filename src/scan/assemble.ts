import type { CodeRecord, CollectionRecord, ComponentRecord, Hub, PageRecord, PageScan, SiteInfo } from '../types';
import { uniq } from '../util';
import type { DesignerCollection } from './canvas';
import type { DataApiResult } from './dataApi';

/** Known third-party services, so external links read as "Amilia registration" rather than a bare URL. */
const SERVICES: Array<[RegExp, string]> = [
  [/amilia\.com/i, 'Amilia registration / store'],
  [/wixforms\.com|wix\.com\/.*form/i, 'Wix form'],
  [/forms\.office\.com|forms\.microsoft\.com/i, 'Microsoft Forms'],
  [/docs\.google\.com\/forms|forms\.gle/i, 'Google Forms'],
  [/typeform\.com/i, 'Typeform'],
  [/jotform\.com/i, 'Jotform'],
  [/etapestry\.com|blackbaud/i, 'eTapestry / Blackbaud donation form'],
  [/canadahelps\.org/i, 'CanadaHelps donation form'],
  [/donorbox\.org/i, 'Donorbox donation form'],
  [/eventbrite\./i, 'Eventbrite tickets'],
  [/calendly\.com/i, 'Calendly booking'],
  [/hubspot|hsforms/i, 'HubSpot form'],
  [/mailchimp|list-manage\.com/i, 'Mailchimp signup'],
  [/stripe\.com|buy\.stripe/i, 'Stripe checkout'],
  [/paypal\.com/i, 'PayPal'],
  [/shopify|myshopify/i, 'Shopify store'],
  [/zoom\.us/i, 'Zoom'],
];

export function serviceFor(url: string): string | null {
  for (const [re, name] of SERVICES) if (re.test(url)) return name;
  return null;
}

function slugFromTemplate(path: string | null, name: string): string {
  const m = path?.match(/^\/?([^/]+)\/\[item-slug\]/);
  if (m) return m[1];
  return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface HubParts {
  site: SiteInfo;
  pages: PageRecord[];
  components: ComponentRecord[];
  canvas: { pages: Map<string, PageScan>; collections: Map<string, DesignerCollection>; warnings: string[] } | null;
  dataApi: DataApiResult | null;
  warnings: string[];
}

export function assembleHub(parts: HubParts): Hub {
  const { site, components } = parts;
  const pages = parts.pages.map((p) => ({ ...p, scan: parts.canvas?.pages.get(p.id) }));
  const warnings = [...parts.warnings, ...(parts.canvas?.warnings ?? []), ...(parts.dataApi?.warnings ?? [])];

  // Collections: the Data API is complete; the canvas fills gaps or stands in for it.
  const collections: CollectionRecord[] = parts.dataApi ? parts.dataApi.collections.map((c) => ({ ...c, fields: c.fields.map((f) => ({ ...f })) })) : [];
  const byId = new Map(collections.map((c) => [c.id, c]));
  const templates = pages.filter((p) => p.category === 'cmsTemplate' && p.collectionId);

  for (const t of templates) {
    if (byId.has(t.collectionId!)) continue;
    const rec: CollectionRecord = {
      id: t.collectionId!,
      name: t.collectionName ?? 'Collection',
      singularName: '',
      slug: slugFromTemplate(t.path, t.collectionName ?? ''),
      itemCount: null,
      liveItemCount: null,
      templatePageId: t.id,
      templatePath: t.path,
      templatePublished: !t.isDraft,
      listedOn: [],
      fields: [],
      source: 'partial',
    };
    collections.push(rec);
    byId.set(rec.id, rec);
  }
  for (const dc of parts.canvas?.collections.values() ?? []) {
    let rec = byId.get(dc.id);
    if (!rec) {
      rec = {
        id: dc.id,
        name: dc.name,
        singularName: '',
        slug: slugFromTemplate(null, dc.name),
        itemCount: null,
        liveItemCount: null,
        templatePageId: null,
        templatePath: null,
        templatePublished: null,
        listedOn: [],
        fields: [],
        source: 'partial',
      };
      collections.push(rec);
      byId.set(rec.id, rec);
    }
    if (rec.itemCount === null) rec.itemCount = dc.itemCount;
    rec.listedOn = uniq([...rec.listedOn, ...dc.listedOn]);
    if (rec.source !== 'dataApi') {
      for (const f of dc.fields) if (!rec.fields.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) rec.fields.push({ ...f });
      if (rec.fields.length) rec.source = 'designer';
    } else {
      // Keep Data API fields but borrow option lists the canvas found.
      for (const f of rec.fields) {
        const df = dc.fields.find((x) => x.name.toLowerCase() === f.name.toLowerCase());
        if (df && !f.options.length && df.options.length) f.options = df.options;
      }
    }
  }
  for (const c of collections) {
    const t = templates.find((p) => p.collectionId === c.id);
    if (t) {
      c.templatePageId = t.id;
      c.templatePath = t.path;
      c.templatePublished = !t.isDraft;
    }
    // Every collection has Name and Slug, even when the canvas could not list fields.
    if (c.source !== 'dataApi') {
      if (!c.fields.some((f) => f.slug === 'name' || f.name.toLowerCase() === 'name')) {
        c.fields.unshift({ id: 'name', name: 'Name', slug: 'name', type: 'plainText', required: true, helpText: '', options: [], referenceCollection: null, validations: {} });
      }
      if (!c.fields.some((f) => f.slug === 'slug' || f.type === 'slug')) {
        c.fields.splice(1, 0, { id: 'slug', name: 'Slug', slug: 'slug', type: 'slug', required: true, helpText: '', options: [], referenceCollection: null, validations: {} });
      }
    }
  }
  collections.sort((a, b) => a.name.localeCompare(b.name));

  // Components: where they are used.
  const scanned = pages.filter((p) => p.scan && !p.scan.error);
  for (const c of components) {
    c.usedOn = scanned.filter((p) => (p.scan!.components[c.name] ?? 0) > 0).map((p) => {
      const n = p.scan!.components[c.name];
      return n > 1 ? `${p.name} (x${n})` : p.name;
    });
  }

  // Code, forms and external services.
  const code: CodeRecord[] = [...(parts.dataApi?.code ?? [])];
  if (parts.canvas) {
    // The canvas sees forms in place, so it replaces the Data API's per-page form list.
    for (let i = code.length - 1; i >= 0; i--) if (code[i].kind === 'form') code.splice(i, 1);
    const formGroups = new Map<string, { pages: string[]; form: NonNullable<PageScan['forms']>[number] }>();
    for (const p of scanned) {
      for (const f of p.scan!.forms) {
        const key = `${f.insideComponent ?? ''}|${f.name}|${f.fields.join(',')}`;
        const g = formGroups.get(key) ?? { pages: [], form: f };
        g.pages.push(p.name);
        formGroups.set(key, g);
      }
    }
    for (const { pages: on, form } of formGroups.values()) {
      code.push({
        location: form.insideComponent ? `${form.insideComponent} component (${on.length} ${on.length === 1 ? 'page' : 'pages'})` : on.join(', '),
        name: `${form.name} (Webflow form)`,
        purpose: `Fields: ${form.fields.join(', ') || 'none found'}.${form.redirect ? ` Redirects to ${form.redirect}.` : ''}${form.action ? ` Posts to ${form.action}.` : ' Submissions go to Webflow Forms.'}`,
        notes: form.insideComponent && on.length > 1 ? `Edit once in the ${form.insideComponent} component. Webflow lists it as a separate form on each page.` : '',
        kind: 'form',
      });
    }
    const embedPages = scanned.filter((p) => p.scan!.embeds > 0);
    for (const p of embedPages) {
      code.push({
        location: p.name,
        name: `Code Embed element${p.scan!.embeds > 1 ? `s (x${p.scan!.embeds})` : ''}`,
        purpose: 'Custom HTML/CSS/JS placed on the canvas',
        notes: 'Open the page in the Designer and search the Navigator for "Embed" to edit',
        kind: 'embed',
      });
    }
    const hosts = [site.productionUrl, site.stagingUrl].filter(Boolean).map((u) => new URL(u!).host);
    const services = new Map<string, Set<string>>();
    for (const p of scanned) {
      for (const url of p.scan!.urls) {
        let host = '';
        try {
          host = new URL(url).host;
        } catch {
          continue;
        }
        if (hosts.includes(host)) {
          p.scan!.linkPaths.push(new URL(url).pathname.replace(/\/$/, '') || '/');
          continue;
        }
        const svc = serviceFor(url);
        if (!svc) continue;
        if (!services.has(svc)) services.set(svc, new Set());
        services.get(svc)!.add(p.name);
      }
    }
    for (const [svc, on] of services) {
      const list = [...on];
      code.push({
        location: list.length > 6 ? `${list.slice(0, 6).join(', ')} and ${list.length - 6} more` : list.join(', '),
        name: `External link – ${svc}`,
        purpose: 'Buttons or links that send visitors to an outside system',
        notes: 'External system, not managed in Webflow',
        kind: 'external',
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    site,
    pages,
    collections,
    components,
    code,
    warnings,
    sources: { designer: true, canvas: !!parts.canvas, dataApi: !!parts.dataApi },
  };
}
