/**
 * The Knowledge Hub data model. Every scanner fills part of a `Hub`, and every
 * view and export reads from it, so this file is the contract between them.
 */

export type PageCategory =
  | 'static'
  | 'cmsTemplate'
  | 'utility'
  | 'ecommerce'
  | 'userAccount'
  | 'staticTemplate';

export interface SiteInfo {
  id: string;
  name: string;
  shortName: string;
  stagingUrl: string | null;
  productionUrl: string | null;
  lastPublished: string | null;
}

export interface FormUsage {
  name: string;
  /** Labels or names of the inputs inside the form. */
  fields: string[];
  action: string;
  redirect: string;
  /** Set when the form lives inside a component (for example the Footer). */
  insideComponent: string | null;
}

export interface CmsBinding {
  fieldName: string;
  fieldType: string;
  /** Human description of the element the field feeds, e.g. "Heading (H1)". */
  element: string;
}

export interface PageRecord {
  id: string;
  name: string;
  slug: string;
  /** e.g. `/about/our-team` or `/blog-posts/[item-slug]` */
  path: string;
  url: string | null;
  folder: string;
  kind: string;
  category: PageCategory;
  isDraft: boolean;
  isHome: boolean;
  isPasswordProtected: boolean;
  utilityKey: string | null;
  collectionId: string | null;
  collectionName: string | null;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  excludedFromSearch: boolean;
  /** Filled by the canvas scan. Undefined means the page was not scanned. */
  scan?: PageScan;
}

export interface PageScan {
  /** Component name → number of instances on the page (top level and nested). */
  components: Record<string, number>;
  forms: FormUsage[];
  /** Names of collections shown in Collection Lists on the page. */
  collectionLists: string[];
  embeds: number;
  /** Field bindings found on a CMS template page. */
  bindings: CmsBinding[];
  /** Page ids this page links to. */
  linksTo: string[];
  /** Plain URL / path links (for matching pages that are linked by path). */
  linkPaths: string[];
  /** Absolute URLs linked from the page (external services, or this site by full URL). */
  urls: string[];
  error?: string;
}

export interface CollectionField {
  id: string;
  name: string;
  slug: string;
  type: string;
  required: boolean | null;
  helpText: string;
  options: string[];
  referenceCollection: string | null;
  validations: Record<string, unknown>;
}

export interface CollectionRecord {
  id: string;
  name: string;
  singularName: string;
  slug: string;
  itemCount: number | null;
  liveItemCount: number | null;
  templatePageId: string | null;
  templatePath: string | null;
  templatePublished: boolean | null;
  /** Static pages that show this collection in a Collection List. */
  listedOn: string[];
  fields: CollectionField[];
  /** Where the field data came from, so the UI can say how complete it is. */
  source: 'dataApi' | 'designer' | 'partial';
}

export interface ComponentProp {
  id: string;
  name: string;
  group: string | null;
  type: string;
  tooltip: string | null;
  defaultValue: string;
}

export interface ComponentRecord {
  id: string;
  name: string;
  group: string;
  description: string;
  instanceCount: number | null;
  variants: string[];
  props: ComponentProp[];
  /** Page names the component appears on (from the canvas scan). */
  usedOn: string[];
  /** Components this one is nested inside (from walking component trees). */
  nestedIn: string[];
  fromLibrary: string | null;
  isCodeComponent: boolean;
  /** Page ids and paths linked from inside the component (used to find orphan pages). */
  linksTo: string[];
  linkPaths: string[];
}

export interface CodeRecord {
  location: string;
  name: string;
  purpose: string;
  notes: string;
  kind: 'script' | 'embed' | 'form' | 'external' | 'manual';
}

export interface Hub {
  generatedAt: string;
  site: SiteInfo;
  pages: PageRecord[];
  collections: CollectionRecord[];
  components: ComponentRecord[];
  code: CodeRecord[];
  /** Messages about anything the scan could not read. */
  warnings: string[];
  sources: { designer: boolean; canvas: boolean; dataApi: boolean };
}

/** Editor notes, keyed by `${section}:${rowKey}`, kept with the site. */
export type Notes = Record<string, string>;

export interface ScanOptions {
  /** Visit every page in the canvas to find components, forms and bindings. */
  deepScan: boolean;
  dataApi: { proxyUrl: string; token: string } | null;
}

export type Progress = (message: string, done?: number, total?: number) => void;
