/**
 * A small in-memory stand-in for the Designer API, enough to run every
 * scanner end to end in tests.
 */
type El = Record<string, unknown> & { id: { component: string; element: string }; type: string };

let n = 0;
const el = (type: string, extra: Record<string, unknown> = {}, kids: El[] = []): El => ({
  id: { component: '', element: `e${++n}` },
  type,
  children: kids.length > 0 || extra.children === true,
  getChildren: async () => kids,
  ...extra,
});

export function installMockWebflow() {
  const folder = { id: 'f-about', type: 'PageFolder', getName: async () => 'About', getSlug: async () => 'about', getParent: async () => null };

  const mkPage = (o: { id: string; name: string; slug: string; kind?: string; parent?: unknown; draft?: boolean; home?: boolean; collectionId?: string; collectionName?: string; title?: string; desc?: string }) => ({
    id: o.id,
    type: 'Page',
    getName: async () => o.name,
    getSlug: async () => o.slug,
    getKind: async () => o.kind ?? 'static',
    isDraft: async () => !!o.draft,
    isHomepage: async () => !!o.home,
    isPasswordProtected: async () => false,
    getUtilityPageKey: async () => (o.kind === 'utility' ? o.slug : null),
    getParent: async () => o.parent ?? null,
    getCollectionId: async () => o.collectionId ?? null,
    getCollectionName: async () => o.collectionName ?? null,
    getPublishPath: async () => null,
    getTitle: async () => o.title ?? o.name,
    getDescription: async () => o.desc ?? '',
    usesTitleAsSearchTitle: async () => true,
    getSearchTitle: async () => '',
    usesDescriptionAsSearchDescription: async () => true,
    getSearchDescription: async () => '',
    getOpenGraphTitle: async () => '',
    usesTitleAsOpenGraphTitle: async () => true,
    getOpenGraphDescription: async () => '',
    usesDescriptionAsOpenGraphDescription: async () => true,
    getOpenGraphImage: async () => null,
    isExcludedFromSearch: async () => false,
  });

  const pages = [
    mkPage({ id: 'home', name: 'Home', slug: 'index', home: true, desc: 'Welcome' }),
    mkPage({ id: 'team', name: 'Our Team', slug: 'our-team', parent: folder, desc: 'Meet us' }),
    mkPage({ id: 'hidden', name: 'Hidden', slug: 'hidden' }),
    mkPage({ id: 'blogT', name: 'Blog Posts Template', slug: 'detail_blog-posts', kind: 'cms', collectionId: 'c-blog', collectionName: 'Blog Posts' }),
    mkPage({ id: '404', name: '404', slug: '404', kind: 'utility' }),
  ];

  // Components
  const button = {
    id: 'k-button',
    library: null,
    codeComponent: false,
    getName: async () => 'Button',
    getSettings: async () => ({ name: 'Button', group: 'Global', description: '' }),
    getProps: async () => [
      { id: 'p1', name: 'Text', group: null, type: 'textContent', tooltip: null, defaultValue: 'Learn more' },
      { id: 'p2', name: 'Link', group: null, type: 'link', tooltip: null, defaultValue: null },
      { id: 'p3', name: 'Style', group: null, type: 'variant', tooltip: null, defaultValue: null },
    ],
    getVariants: async () => [{ id: 'base', name: 'Base' }, { id: 'v2', name: 'Secondary' }],
    getInstanceCount: async () => 3,
    getRootElement: async () => el('Link'),
  };
  const navLink = () => el('Link', { getResolvedSettings: async () => ({ link: { mode: 'page', to: { pageId: 'team' } } }) });
  const footerForm = () =>
    el('FormForm', { getName: async () => 'Newsletter', getSettings: async () => ({ action: '', redirect: '' }) }, [
      el('FormTextInput', { getResolvedSettings: async () => ({ name: 'Email', required: true }) }),
    ]);
  const inst = (comp: unknown, extra: Record<string, unknown> = {}) =>
    el('ComponentInstance', { getComponent: async () => comp, getSlots: async () => [], getProps: async () => [], getResolvedProps: async () => [], ...extra });

  const navbar = {
    id: 'k-nav', library: null, codeComponent: false,
    getName: async () => 'Navbar',
    getSettings: async () => ({ name: 'Navbar', group: 'Global', description: 'Global header' }),
    getProps: async () => [], getVariants: async () => [], getInstanceCount: async () => 3,
    getRootElement: async () => el('Block', {}, [navLink(), inst(button, { getResolvedProps: async () => [{ propId: 'p2', value: { mode: 'url', to: '/' } }] })]),
  };
  const footer = {
    id: 'k-footer', library: null, codeComponent: false,
    getName: async () => 'Footer',
    getSettings: async () => ({ name: 'Footer', group: 'Global', description: '' }),
    getProps: async () => [], getVariants: async () => [], getInstanceCount: async () => 3,
    getRootElement: async () => el('Block', {}, [footerForm()]),
  };

  const list = el('DynamoWrapper', {
    getSettings: async () => ({ source: { collectionId: 'c-staff' }, sort: [{ fieldSlug: 'order', direction: 'ascending' }] }),
    searchAvailableSources: async () => [
      { collectionId: 'c-staff', displayName: 'Staff' },
      { collectionId: 'c-blog', displayName: 'Blog Posts' },
      { collectionId: 'c-teams', displayName: 'Teams' },
    ],
    searchAvailableFields: async () => [
      { slug: 'name', displayName: 'Name', fieldType: 'plainText', canFilter: true, canSort: true, filterOperators: [] },
      { slug: 'order', displayName: 'Sort Order', fieldType: 'number', canFilter: true, canSort: true, filterOperators: [] },
      { slug: 'team', displayName: 'Team', fieldType: 'itemRef', canFilter: true, canSort: false, filterOperators: [], referenceCollectionId: 'c-teams' },
      { slug: 'role', displayName: 'Role', fieldType: 'option', canFilter: true, canSort: false, filterOperators: [], options: [{ id: 'a', name: 'Staff' }, { id: 'b', name: 'Board' }] },
    ],
    searchAvailableItems: async (o?: { fieldSlug?: string }) => ({ items: [], total: o?.fieldSlug === 'team' ? 4 : 17 }),
  });

  const heading = el('Heading', {
    getSettings: async () => ({ headingTag: 'h1', textContent: { sourceType: 'cms', collectionId: 'c-blog', fieldId: 'f-name', fieldName: 'Name', fieldType: 'plainText' } }),
    getDisplayName: async () => null,
  });
  const image = el('Image', { getSettings: async () => ({ image: { sourceType: 'cms', fieldName: 'Main Image', fieldType: 'image' } }), getDisplayName: async () => 'Hero image' });

  const trees: Record<string, El> = {
    home: el('Body', {}, [inst(navbar), inst(button), inst(button), el('HtmlEmbed'), el('Link', { getResolvedSettings: async () => ({ link: { mode: 'url', to: 'https://app.amilia.com/store/x' } }) }), inst(footer)]),
    team: el('Body', {}, [inst(navbar), list, inst(footer)]),
    hidden: el('Body', {}, [inst(footer)]),
    blogT: Object.assign(el('Body', {}, [inst(navbar), heading, image, inst(footer)]), {
      searchBindableSources: async () => [
        { sourceType: 'cms', collectionId: 'c-blog', collectionName: 'Blog Posts', fieldId: 'f-name', fieldName: 'Name', fieldType: 'plainText' },
        { sourceType: 'cms', collectionId: 'c-blog', collectionName: 'Blog Posts', fieldId: 'f-img', fieldName: 'Main Image', fieldType: 'image' },
        { sourceType: 'cms', collectionId: 'c-blog', collectionName: 'Blog Posts', fieldId: 'f-body', fieldName: 'Post Body', fieldType: 'richText' },
      ],
    }),
    '404': el('Body', {}, [inst(footer)]),
  };

  let current = pages[0];
  const switched: string[] = [];
  (globalThis as Record<string, unknown>).webflow = {
    getSiteInfo: async () => ({ siteId: 'site1', siteName: 'Mock Site', shortName: 'mock', domains: [{ url: 'mock.webflow.io', stage: 'staging', default: true, lastPublished: '2026-10-01T00:00:00Z' }] }),
    getAllPagesAndFolders: async () => [folder, ...pages],
    getAllComponents: async () => [button, navbar, footer],
    getCurrentPage: async () => current,
    switchPage: async (p: (typeof pages)[number]) => {
      current = p;
      switched.push(p.id);
      return null;
    },
    getRootElement: async () => trees[current.id],
  };
  return { switched };
}
