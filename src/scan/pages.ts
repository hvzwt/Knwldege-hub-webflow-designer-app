import type { PageCategory, PageRecord, SiteInfo } from '../types';
import { has, joinPath, mapLimit, safe } from '../util';

type WfPage = Page;
type WfFolder = Folder;

export async function readSiteInfo(): Promise<SiteInfo> {
  const info = await safe(() => webflow.getSiteInfo(), null);
  const domains = info?.domains ?? [];
  const staging = domains.find((d) => d.stage === 'staging');
  const production = domains.find((d) => d.stage === 'production' && d.default) ?? domains.find((d) => d.stage === 'production');
  const withScheme = (u?: string) => (u ? (u.startsWith('http') ? u : `https://${u}`) : null);
  const published = domains.map((d) => d.lastPublished).filter(Boolean).sort().pop() ?? null;
  return {
    id: info?.siteId ?? '',
    name: info?.siteName ?? 'This site',
    shortName: info?.shortName ?? '',
    stagingUrl: withScheme(staging?.url) ?? (info?.shortName ? `https://${info.shortName}.webflow.io` : null),
    productionUrl: withScheme(production?.url),
    lastPublished: published,
  };
}

const KIND_TO_CATEGORY: Record<string, PageCategory> = {
  static: 'static',
  cms: 'cmsTemplate',
  utility: 'utility',
  ecommerce: 'ecommerce',
  userSystems: 'userAccount',
  staticTemplate: 'staticTemplate',
};

async function folderPath(folder: WfFolder | null, cache: Map<string, Promise<string>>): Promise<string> {
  if (!folder) return '';
  let hit = cache.get(folder.id);
  if (!hit) {
    hit = (async () => {
      const [slug, parent] = await Promise.all([
        safe(() => folder.getSlug(), ''),
        safe(() => folder.getParent(), null),
      ]);
      const parentPath = await folderPath(parent, cache);
      return [parentPath, slug].filter(Boolean).join('/');
    })();
    cache.set(folder.id, hit);
  }
  return hit;
}

async function folderName(folder: WfFolder | null): Promise<string> {
  return folder ? safe(() => folder.getName(), '') : '';
}

export async function readPages(site: SiteInfo, onPage?: (n: number, total: number) => void): Promise<PageRecord[]> {
  const all = await safe(() => webflow.getAllPagesAndFolders(), [] as Array<WfPage | WfFolder>);
  const pages = all.filter((p): p is WfPage => p.type === 'Page');
  const folders = new Map<string, Promise<string>>();
  const base = site.productionUrl ?? site.stagingUrl;
  let done = 0;

  return mapLimit(pages, 6, async (page) => {
    const [name, slug, kind, isDraft, isHome, protectedPage, utilityKey, parent, collectionId, collectionName, publishPath] =
      await Promise.all([
        safe(() => page.getName(), ''),
        safe(() => page.getSlug(), ''),
        safe(() => (has(page, 'getKind') ? page.getKind() : 'static'), 'static' as string),
        safe(() => page.isDraft(), false),
        safe(() => page.isHomepage(), false),
        safe(() => page.isPasswordProtected(), false),
        safe(() => page.getUtilityPageKey(), null),
        safe(() => page.getParent(), null),
        safe(() => page.getCollectionId(), null),
        safe(() => page.getCollectionName(), null),
        safe(() => (has(page, 'getPublishPath') ? page.getPublishPath() : null), null),
      ]);

    const [title, description, usesTitleForSearch, searchTitle, usesDescForSearch, searchDescription, ogTitle, usesTitleForOg, ogDescription, usesDescForOg, ogImage, excluded] =
      await Promise.all([
        safe(() => page.getTitle(), ''),
        safe(() => page.getDescription(), ''),
        safe(() => page.usesTitleAsSearchTitle(), true),
        safe(() => page.getSearchTitle(), ''),
        safe(() => page.usesDescriptionAsSearchDescription(), true),
        safe(() => page.getSearchDescription(), ''),
        safe(() => page.getOpenGraphTitle(), ''),
        safe(() => page.usesTitleAsOpenGraphTitle(), true),
        safe(() => page.getOpenGraphDescription(), ''),
        safe(() => page.usesDescriptionAsOpenGraphDescription(), true),
        safe(() => page.getOpenGraphImage(), null),
        safe(() => page.isExcludedFromSearch(), false),
      ]);

    const fPath = await folderPath(parent, folders);
    let category: PageCategory = KIND_TO_CATEGORY[kind] ?? 'static';
    if (collectionId && category === 'static') category = 'cmsTemplate';
    if (utilityKey && category === 'static') category = 'utility';

    let path: string;
    if (publishPath) path = joinPath(publishPath);
    else if (isHome) path = '/';
    else path = joinPath(fPath, slug);
    if (category === 'cmsTemplate' && !path.includes('[')) path = joinPath(path, '[item-slug]');

    onPage?.(++done, pages.length);
    return {
      id: page.id,
      name: name || slug || 'Untitled page',
      slug,
      path,
      url: base ? `${base.replace(/\/$/, '')}${path === '/' ? '/' : path}` : null,
      folder: (await folderName(parent)) || '',
      kind,
      category,
      isDraft,
      isHome,
      isPasswordProtected: protectedPage,
      utilityKey,
      collectionId,
      collectionName,
      seoTitle: (usesTitleForSearch ? title : searchTitle) || title,
      seoDescription: (usesDescForSearch ? description : searchDescription) || description,
      ogTitle: (usesTitleForOg ? title : ogTitle) || '',
      ogDescription: (usesDescForOg ? description : ogDescription) || '',
      ogImage,
      excludedFromSearch: excluded,
    } satisfies PageRecord;
  }).then((list) => list.sort(comparePages));
}

const CATEGORY_ORDER: PageCategory[] = ['static', 'staticTemplate', 'cmsTemplate', 'ecommerce', 'userAccount', 'utility'];

function comparePages(a: PageRecord, b: PageRecord): number {
  if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
  if (a.isDraft !== b.isDraft) return a.isDraft ? 1 : -1;
  const c = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  return c || a.path.localeCompare(b.path);
}
