import type { CodeRecord, CollectionField, CollectionRecord, PageRecord } from '../types';
import { mapLimit } from '../util';

/**
 * Optional Webflow Data API enrichment. The Designer API cannot read CMS
 * field settings, item counts for every collection, applied scripts or form
 * submissions settings, so when a site token is provided we read them through
 * the small read-only proxy in `/proxy` (the Data API does not accept calls
 * straight from the Designer iframe).
 */

const TYPE_MAP: Record<string, string> = {
  PlainText: 'plainText',
  RichText: 'richText',
  Image: 'image',
  MultiImage: 'multiImage',
  Video: 'video',
  VideoLink: 'video',
  Link: 'url',
  Email: 'email',
  Phone: 'phone',
  Number: 'number',
  DateTime: 'date',
  Switch: 'boolean',
  Color: 'color',
  Option: 'option',
  File: 'file',
  Reference: 'itemRef',
  MultiReference: 'itemRefSet',
  User: 'user',
};

interface ApiField {
  id: string;
  slug: string;
  displayName: string;
  type: string;
  isRequired?: boolean;
  helpText?: string;
  validations?: Record<string, unknown> & { options?: Array<{ name: string }>; collectionId?: string };
}

export interface DataApiResult {
  collections: CollectionRecord[];
  code: CodeRecord[];
  warnings: string[];
}

export class DataApi {
  constructor(private proxyUrl: string, private token: string) {}

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.proxyUrl.replace(/\/$/, '')}${path}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} on ${path}${text ? `: ${text.slice(0, 160)}` : ''}`);
    }
    return res.json() as Promise<T>;
  }

  async test(siteId: string): Promise<string> {
    const site = await this.get<{ displayName?: string }>(`/v2/sites/${siteId}`);
    return site.displayName ?? 'connected';
  }

  async read(siteId: string, pages: PageRecord[], progress: (msg: string) => void): Promise<DataApiResult> {
    const warnings: string[] = [];
    const code: CodeRecord[] = [];

    progress('Reading CMS collections');
    const list = await this.get<{ collections: Array<{ id: string; displayName: string; singularName: string; slug: string }> }>(
      `/v2/sites/${siteId}/collections`,
    );
    const names = new Map(list.collections.map((c) => [c.id, c.displayName]));

    const collections = await mapLimit(list.collections, 3, async (c) => {
      const [detail, staged, live] = await Promise.all([
        this.get<{ fields: ApiField[] }>(`/v2/collections/${c.id}`),
        this.get<{ pagination?: { total: number } }>(`/v2/collections/${c.id}/items?limit=1`).catch(() => null),
        this.get<{ pagination?: { total: number } }>(`/v2/collections/${c.id}/items/live?limit=1`).catch(() => null),
      ]);
      const template = pages.find((p) => p.collectionId === c.id);
      const fields: CollectionField[] = detail.fields.map((f) => ({
        id: f.id,
        name: f.displayName,
        slug: f.slug,
        type: TYPE_MAP[f.type] ?? f.type,
        required: f.isRequired ?? null,
        helpText: f.helpText ?? '',
        options: (f.validations?.options ?? []).map((o) => o.name),
        referenceCollection: f.validations?.collectionId ? names.get(f.validations.collectionId) ?? f.validations.collectionId : null,
        validations: Object.fromEntries(Object.entries(f.validations ?? {}).filter(([k]) => k !== 'options' && k !== 'collectionId')),
      }));
      return {
        id: c.id,
        name: c.displayName,
        singularName: c.singularName,
        slug: c.slug,
        itemCount: staged?.pagination?.total ?? null,
        liveItemCount: live?.pagination?.total ?? null,
        templatePageId: template?.id ?? null,
        templatePath: template?.path ?? `/${c.slug}/[item-slug]`,
        templatePublished: template ? !template.isDraft : null,
        listedOn: [],
        fields,
        source: 'dataApi',
      } satisfies CollectionRecord;
    });

    progress('Reading custom code');
    try {
      const registered = await this.get<{ registeredScripts?: Array<{ id: string; displayName: string; version: string; hostedLocation?: string }> }>(
        `/v2/sites/${siteId}/registered_scripts`,
      );
      const applied = await this.get<{ scripts?: Array<{ id: string; location: string; version: string }> }>(`/v2/sites/${siteId}/custom_code`);
      const appliedIds = new Set((applied.scripts ?? []).map((s) => `${s.id}@${s.version}`));
      for (const s of applied.scripts ?? []) {
        const reg = registered.registeredScripts?.find((r) => r.id === s.id);
        code.push({
          location: `Site-wide – ${s.location === 'header' ? 'Head' : 'Footer'} (registered script)`,
          name: `${reg?.displayName ?? s.id} v${s.version}`,
          purpose: reg?.hostedLocation ? `Hosted at ${reg.hostedLocation}` : 'Inline registered script',
          notes: 'Applied to every page',
          kind: 'script',
        });
      }
      const notApplied = (registered.registeredScripts ?? []).filter((r) => !appliedIds.has(`${r.id}@${r.version}`));
      if (notApplied.length) {
        code.push({
          location: 'Site-wide – Registered scripts (not applied)',
          name: notApplied.map((r) => `${r.displayName} v${r.version}`).join(', '),
          purpose: 'Registered on the site but not applied at site level',
          notes: 'They may still be applied on single pages. Safe to clean up when unused.',
          kind: 'script',
        });
      }
      const pageCode = await mapLimit(
        pages,
        4,
        async (p) => {
          const r = await this.get<{ scripts?: Array<{ id: string; location: string; version: string }> }>(`/v2/pages/${p.id}/custom_code`).catch(() => null);
          return { page: p, scripts: r?.scripts ?? [] };
        },
      );
      for (const { page, scripts } of pageCode) {
        for (const s of scripts) {
          const reg = registered.registeredScripts?.find((r) => r.id === s.id);
          code.push({
            location: page.name,
            name: `${reg?.displayName ?? s.id} v${s.version}`,
            purpose: `Page ${s.location === 'header' ? 'head' : 'footer'} script`,
            notes: '',
            kind: 'script',
          });
        }
      }
    } catch (err) {
      warnings.push(`Custom code could not be read (${(err as Error).message}). Give the token the custom_code:read scope.`);
    }

    progress('Reading forms');
    try {
      const forms = await this.get<{ forms?: Array<{ displayName: string; pageName?: string; fields?: Record<string, { displayName?: string; type?: string }> }> }>(
        `/v2/sites/${siteId}/forms?limit=100`,
      );
      const grouped = new Map<string, { pages: string[]; fields: string }>();
      for (const f of forms.forms ?? []) {
        const fields = Object.values(f.fields ?? {}).map((x) => `${x.displayName ?? ''}${x.type ? ` (${x.type})` : ''}`).join(', ');
        const key = `${f.displayName}|${fields}`;
        const g = grouped.get(key) ?? { pages: [], fields };
        if (f.pageName) g.pages.push(f.pageName);
        grouped.set(key, g);
      }
      for (const [key, g] of grouped) {
        code.push({
          location: g.pages.length > 3 ? `${g.pages.length} pages` : g.pages.join(', ') || 'Site',
          name: `${key.split('|')[0]} (Webflow form)`,
          purpose: `Fields: ${g.fields || 'none listed'}. Submissions go to Webflow Forms.`,
          notes: g.pages.length > 1 ? `Webflow lists this as ${g.pages.length} separate forms (one per page).` : '',
          kind: 'form',
        });
      }
    } catch (err) {
      warnings.push(`Forms could not be read (${(err as Error).message}). Give the token the forms:read scope.`);
    }

    return { collections, code, warnings };
  }
}
