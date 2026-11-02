import { beforeEach, describe, expect, it } from 'vitest';
import { demoHub } from '../src/demo';
import { toCsv, toHtml, toMarkdown, toTsv } from '../src/export/exporters';
import { collectionSteps, fieldGuidance } from '../src/guide/fieldGuide';
import { allTables, findings, summarize } from '../src/report/tables';
import { buildHub } from '../src/scan';
import { installMockWebflow } from './mockWebflow';

describe('scan against a mocked Designer API', () => {
  let switched: string[];
  beforeEach(() => {
    switched = installMockWebflow().switched;
  });

  it('counts pages by type and builds paths', async () => {
    const hub = await buildHub({ deepScan: true, dataApi: null }, () => undefined);
    const s = summarize(hub);
    expect(s.staticPages).toBe(3);
    expect(s.cmsTemplates).toBe(1);
    expect(s.utilityPages).toBe(1);
    expect(hub.pages.find((p) => p.id === 'team')!.path).toBe('/about/our-team');
    expect(hub.pages.find((p) => p.id === 'blogT')!.path).toContain('[item-slug]');
    expect(hub.pages[0].isHome).toBe(true);
    // Returned to the page the user started on.
    expect(switched.at(-1)).toBe('home');
  });

  it('finds components, nesting, forms, embeds and external services', async () => {
    const hub = await buildHub({ deepScan: true, dataApi: null }, () => undefined);
    const home = hub.pages.find((p) => p.id === 'home')!;
    expect(home.scan!.components).toEqual({ Navbar: 1, Button: 2, Footer: 1 });
    expect(home.scan!.forms[0]).toMatchObject({ name: 'Newsletter', insideComponent: 'Footer' });
    expect(home.scan!.forms[0].fields[0]).toContain('Email');
    const button = hub.components.find((c) => c.name === 'Button')!;
    expect(button.nestedIn).toEqual(['Navbar']);
    expect(button.variants).toEqual(['Secondary']);
    expect(button.props.map((p) => p.name)).toEqual(['Text', 'Link', 'Style']);
    const code = hub.code.map((c) => c.name);
    expect(code).toContain('Code Embed element');
    expect(code).toContain('External link – Amilia registration / store');
    expect(code.some((c) => c.startsWith('Newsletter'))).toBe(true);
  });

  it('reads collections from Collection Lists and template bindings', async () => {
    const hub = await buildHub({ deepScan: true, dataApi: null }, () => undefined);
    const staff = hub.collections.find((c) => c.id === 'c-staff')!;
    expect(staff.name).toBe('Staff');
    expect(staff.itemCount).toBe(17);
    expect(staff.listedOn[0]).toMatch(/^Our Team \(sorted by Sort Order/);
    expect(staff.fields.find((f) => f.name === 'Role')!.options).toEqual(['Staff', 'Board']);
    expect(staff.fields.find((f) => f.name === 'Team')!.referenceCollection).toBe('Teams');
    expect(hub.collections.find((c) => c.id === 'c-teams')!.itemCount).toBe(4);

    const blog = hub.collections.find((c) => c.id === 'c-blog')!;
    expect(blog.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['Name', 'Slug', 'Main Image', 'Post Body']));
    expect(blog.templatePath).toContain('[item-slug]');
    const cms = allTables(hub, {}, []).find((t) => t.id === 'cms')!;
    const nameRow = cms.rows.find((r) => r.key === 'c-blog:f-name')!;
    expect(nameRow.cells[4]).toContain('Heading (H1)');
    const imgRow = cms.rows.find((r) => r.key === 'c-blog:f-img')!;
    expect(imgRow.cells[4]).toContain('Image "Hero image"');
  });

  it('flags orphan pages and says where pages are linked from', async () => {
    const hub = await buildHub({ deepScan: true, dataApi: null }, () => undefined);
    const pages = allTables(hub, {}, []).find((t) => t.id === 'pages')!;
    const row = (id: string) => pages.rows.find((r) => r.key === id)!.cells;
    expect(row('hidden')[11]).toBe('Yes');
    expect(row('team')[11]).toBe('No');
    expect(row('team')[12]).toContain('Linked in Navbar');
    expect(findings(hub).some((f) => f.includes('not linked from anywhere: Hidden'))).toBe(true);
  });

  it('quick scan skips the canvas', async () => {
    const hub = await buildHub({ deepScan: false, dataApi: null }, () => undefined);
    expect(switched).toHaveLength(0);
    expect(hub.sources.canvas).toBe(false);
    expect(hub.pages.every((p) => !p.scan)).toBe(true);
  });
});

describe('content-entry guidance', () => {
  const hub = demoHub();
  const blog = hub.collections.find((c) => c.name === 'Blog Posts')!;

  it('writes field help for common field types', () => {
    const g = (name: string) => fieldGuidance(blog.fields.find((f) => f.name === name)!, blog);
    expect(g('Slug').note).toContain('breaks existing links');
    expect(g('Meta Title').note).toContain('50–60');
    expect(g('Meta Description').note).toContain('140–160');
    expect(g('Main Image').helper).toContain('alt text');
    expect(g('Category').note).toContain('News, Community, Programs');
    expect(g('Post Body').note).toContain('H2/H3');
  });

  it('writes step-by-step instructions per collection', () => {
    const steps = collectionSteps(blog);
    expect(steps[0]).toContain('"Blog Posts"');
    expect(steps.join(' ')).toContain('/blog-posts/[slug]');
    const staff = hub.collections.find((c) => c.name === 'Staff Members')!;
    expect(collectionSteps(staff).join(' ')).toContain('no live page of its own');
    expect(collectionSteps(staff).at(-1)).toContain('"Active" switch');
  });
});

describe('exports', () => {
  const hub = demoHub();
  const notes = { 'pages:p-home': 'Client edits the hero monthly' };
  const tables = allTables(hub, notes, [{ location: 'Site-wide – Head code', name: 'Cookie banner', purpose: 'Consent', notes: '', kind: 'manual' }]);

  it('matches the handover sheet columns', () => {
    expect(tables.map((t) => t.sheetName)).toEqual(['Page Inventory & SEO', 'CMS Collections', 'CMS Field Mapping', 'Component Inventory', 'Custom Code & Forms']);
    expect(tables[2].columns).toEqual(['Collection Name', 'Field Name', 'Field Type', 'Required?', 'Mapped To (Page Element)', 'Notes for Marketing Editors', 'Helper Text']);
    expect(tables[3].columns.slice(0, 4)).toEqual(['Component Name', 'Purpose', 'Pages Used On', 'Props']);
    expect(tables[4].columns).toEqual(['Page/Location', 'Code or Form Name', 'Purpose / Function', 'Notes']);
  });

  it('carries notes and manual rows into every format', () => {
    expect(toMarkdown(hub, tables)).toContain('Client edits the hero monthly');
    expect(toHtml(hub, tables)).toContain('Cookie banner');
    expect(toCsv(tables[0]).split('\n')[0]).toContain('URL,Page Title');
    expect(toTsv(tables[4])).toContain('Cookie banner');
  });

  it('summarises counts including dynamic pages', () => {
    const s = summarize(hub);
    expect(s.staticPages).toBe(7);
    expect(s.cmsTemplates).toBe(3);
    // Blog (24) + Careers (6); the Staff template is a draft.
    expect(s.dynamicPages).toBe(30);
    expect(s.items).toBe(24 + 6 + 41 + 7);
  });
});
