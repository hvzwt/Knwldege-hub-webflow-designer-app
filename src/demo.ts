import { assembleHub } from './scan/assemble';
import type { DesignerCollection } from './scan/canvas';
import type { CollectionField, ComponentRecord, Hub, PageRecord, PageScan } from './types';

/**
 * Sample data for previewing the UI outside the Designer and for tests.
 * It mirrors the shape of a real community-centre site.
 */

const site = {
  id: 'demo-site',
  name: 'Community Centre',
  shortName: 'community-centre',
  stagingUrl: 'https://community-centre.webflow.io',
  productionUrl: null,
  lastPublished: '2026-10-28T15:04:00.000Z',
};

function page(p: Partial<PageRecord> & Pick<PageRecord, 'id' | 'name' | 'path'>): PageRecord {
  return {
    slug: p.path.split('/').pop() ?? '',
    url: `${site.stagingUrl}${p.path}`,
    folder: '',
    kind: 'static',
    category: 'static',
    isDraft: false,
    isHome: false,
    isPasswordProtected: false,
    utilityKey: null,
    collectionId: null,
    collectionName: null,
    seoTitle: p.name,
    seoDescription: `Learn about ${p.name.toLowerCase()} at the Community Centre.`,
    ogTitle: '',
    ogDescription: '',
    ogImage: null,
    excludedFromSearch: false,
    ...p,
  };
}

const footerForm = { name: 'Newsletter', fields: ['Email – email (required)'], action: '', redirect: '', insideComponent: 'Footer' };

function scan(components: Record<string, number>, extra: Partial<PageScan> = {}): PageScan {
  return { components: { 'Global Styles': 1, Navbar: 1, ...components, Footer: 1 }, forms: [footerForm], collectionLists: [], embeds: 0, bindings: [], linksTo: [], linkPaths: [], urls: [], ...extra };
}

const pages: PageRecord[] = [
  page({ id: 'p-home', name: 'Home', path: '/', isHome: true, seoTitle: 'The Community Centre' }),
  page({ id: 'p-about', name: 'About', path: '/about/our-story', folder: 'About' }),
  page({ id: 'p-team', name: 'Our Team', path: '/about/our-team', folder: 'About' }),
  page({ id: 'p-careers', name: 'Careers', path: '/careers' }),
  page({ id: 'p-blog', name: 'Blog', path: '/blog', seoTitle: 'Blog | News & Stories' }),
  page({ id: 'p-guest', name: 'Guest Passes', path: '/guest-passes', seoDescription: '' }),
  page({ id: 'p-components', name: 'Components page', path: '/components-page', seoDescription: '' }),
  page({ id: 'p-404', name: '404', path: '/404', category: 'utility', kind: 'utility', utilityKey: '404', seoDescription: '' }),
  page({ id: 'p-401', name: 'Password', path: '/401', category: 'utility', kind: 'utility', utilityKey: '401', seoDescription: '' }),
  page({ id: 't-blog', name: 'Blog Posts Template', path: '/blog-posts/[item-slug]', category: 'cmsTemplate', kind: 'cms', collectionId: 'c-blog', collectionName: 'Blog Posts', seoTitle: '', seoDescription: '' }),
  page({ id: 't-careers', name: 'Careers Template', path: '/careers/[item-slug]', category: 'cmsTemplate', kind: 'cms', collectionId: 'c-careers', collectionName: 'Careers', seoTitle: '', seoDescription: '' }),
  page({ id: 't-staff', name: 'Staff Members Template', path: '/staff/[item-slug]', category: 'cmsTemplate', kind: 'cms', isDraft: true, collectionId: 'c-staff', collectionName: 'Staff Members', seoTitle: '', seoDescription: '' }),
  page({ id: 'p-draft', name: 'Style Guide', path: '/drafts/style-guide', folder: 'Drafts', isDraft: true }),
];

const scans = new Map<string, PageScan>([
  ['p-home', scan({ Button: 8, 'Program Card': 3 }, { urls: ['https://app.amilia.com/store/en/community/shop'] })],
  ['p-about', scan({ 'Program Detail Hero': 1 })],
  ['p-team', scan({ 'Meet Our Staff': 1 }, { collectionLists: ['Staff Members'] })],
  ['p-careers', scan({}, { collectionLists: ['Careers'], linksTo: ['t-careers'] })],
  ['p-blog', scan({ 'Program Detail Hero': 1, Button: 1 }, { collectionLists: ['Blog Posts'] })],
  ['p-guest', scan({}, { embeds: 1 })],
  ['p-components', scan({ Button: 4, 'Program Card': 2, 'Meet Our Staff': 1, 'Program Detail Hero': 1 })],
  ['p-404', { ...scan({}), components: { 'Global Styles': 1, Footer: 1 } }],
  ['p-401', { components: {}, forms: [{ name: 'Email Form', fields: ['Password'], action: '', redirect: '', insideComponent: null }], collectionLists: [], embeds: 0, bindings: [], linksTo: [], linkPaths: [], urls: [] }],
  ['t-blog', scan({}, { bindings: [
    { fieldName: 'Name', fieldType: 'plainText', element: 'Heading (H1)' },
    { fieldName: 'Main Image', fieldType: 'image', element: 'Image' },
    { fieldName: 'Post Body', fieldType: 'richText', element: 'Rich text' },
    { fieldName: 'Category', fieldType: 'option', element: 'Text "Category tag"' },
  ] })],
  ['t-careers', scan({}, { bindings: [{ fieldName: 'Name', fieldType: 'plainText', element: 'Heading (H1)' }] })],
  ['t-staff', { components: {}, forms: [], collectionLists: [], embeds: 0, bindings: [], linksTo: [], linkPaths: [], urls: [] }],
  ['p-draft', scan({ Button: 5 })],
]);

const f = (name: string, type: string, extra: Partial<CollectionField> = {}): CollectionField => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  slug: name.toLowerCase().replace(/\W+/g, '-'),
  type,
  required: null,
  helpText: '',
  options: [],
  referenceCollection: null,
  validations: {},
  ...extra,
});

const collections = new Map<string, DesignerCollection>([
  ['c-blog', { id: 'c-blog', name: 'Blog Posts', itemCount: 24, listedOn: ['Blog (sorted by Publish Date (newest first), 9 per page)'], fields: [
    f('Name', 'plainText', { slug: 'name', id: 'name' }), f('Slug', 'slug', { slug: 'slug', id: 'slug' }), f('Main Image', 'image'), f('Category', 'option', { options: ['News', 'Community', 'Programs'] }),
    f('Read Time', 'number'), f('Publish Date', 'date'), f('Summary', 'plainText'), f('Post Body', 'richText'), f('Meta Title', 'plainText'), f('Meta Description', 'plainText'),
  ] }],
  ['c-careers', { id: 'c-careers', name: 'Careers', itemCount: 6, listedOn: ['Careers'], fields: [
    f('Name', 'plainText', { slug: 'name', id: 'name' }), f('Slug', 'slug', { slug: 'slug', id: 'slug' }), f('Department', 'itemRef', { referenceCollection: 'Departments' }),
    f('Employment Type', 'option', { options: ['Full-time', 'Part-time', 'Casual'] }), f('Apply URL', 'url'), f('Closing Date', 'date'), f('Sort Order', 'number'),
  ] }],
  ['c-staff', { id: 'c-staff', name: 'Staff Members', itemCount: 41, listedOn: ['Our Team (sorted by Sort Order (A→Z / low→high))'], fields: [
    f('Name', 'plainText', { slug: 'name', id: 'name' }), f('Slug', 'slug', { slug: 'slug', id: 'slug' }), f('Job Title', 'plainText'), f('Teams', 'itemRefSet', { referenceCollection: 'Teams' }),
    f('Headshot', 'image'), f('Short Bio', 'plainText'), f('Active', 'boolean'),
  ] }],
  ['c-departments', { id: 'c-departments', name: 'Departments', itemCount: 7, listedOn: [], fields: [] }],
]);

const comp = (name: string, group: string, props: Array<[string, string]>, extra: Partial<ComponentRecord> = {}): ComponentRecord => ({
  id: `k-${name}`,
  name,
  group,
  description: '',
  instanceCount: null,
  variants: [],
  props: props.map(([n, type], i) => ({ id: `${name}-${i}`, name: n, group: null, type, tooltip: null, defaultValue: '' })),
  usedOn: [],
  nestedIn: [],
  fromLibrary: null,
  isCodeComponent: false,
  linksTo: [],
  linkPaths: [],
  ...extra,
});

const components: ComponentRecord[] = [
  comp('Global Styles', 'Global', [], { instanceCount: 12, description: 'Site-wide CSS/variables wrapper; must stay at the top of every page' }),
  comp('Navbar', 'Global', [], { instanceCount: 11, linksTo: ['p-home', 'p-about', 'p-team', 'p-careers'], description: 'Global header: mega menu, search box, Join/Donate buttons' }),
  comp('Footer', 'Global', [], { instanceCount: 12, linksTo: ['p-about', 'p-careers', 'p-guest'], description: 'Global footer: newsletter signup form, link columns, social links' }),
  comp('Button', 'Global', [['Variant', 'variant'], ['Text', 'textContent'], ['Link', 'link'], ['Show Arrow', 'boolean']], { instanceCount: 18, variants: ['Primary', 'Secondary', 'White', 'Outline White', 'Text'] }),
  comp('Program Detail Hero', 'Program Detail', [['Heading', 'textContent'], ['Image', 'image'], ['Image Alt', 'altText'], ['Intro', 'richText'], ['Button Text', 'string'], ['Button Link', 'link'], ['Button Visibility', 'visibility']], { instanceCount: 3 }),
  comp('Program Card', 'Program', [['Image', 'image'], ['Image Alt', 'altText'], ['Title', 'textContent'], ['Text', 'textContent'], ['Primary Button Link', 'link']], { instanceCount: 5, nestedIn: ['Program Explore'] }),
  comp('Meet Our Staff', 'Program Detail', [['Heading', 'textContent'], ['Slot', 'slot']], { instanceCount: 2 }),
];

export function demoHub(): Hub {
  return assembleHub({
    site,
    pages,
    components: components.map((c) => ({ ...c })),
    canvas: { pages: scans, collections, warnings: [] },
    dataApi: null,
    warnings: ['Sample data – open the extension in the Webflow Designer to scan a real site.'],
  });
}
