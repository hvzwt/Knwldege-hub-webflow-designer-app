import { has, safe } from '../util';

export interface WalkResult {
  /** Component id → instance count. */
  instances: Map<string, number>;
  /** Instance elements, for prop reads. */
  instanceElements: ComponentElement[];
  forms: AnyElement[];
  lists: AnyElement[];
  embeds: number;
  links: AnyElement[];
  /** Elements that may carry CMS bindings (only collected when asked). */
  bindable: AnyElement[];
  inputs: AnyElement[];
}

const LINK_TYPES = new Set(['Link', 'DropdownLink', 'NavbarLink', 'NavbarBrand', 'TabsLink']);
const BINDABLE_TYPES = new Set(['Heading', 'Paragraph', 'String', 'RichText', 'Image', 'Link', 'Block', 'Video', 'YouTubeVideo', 'Span', 'DOM', 'FormButton']);
const INPUT_TYPES = new Set(['FormTextInput', 'FormTextarea', 'FormSelect', 'FormCheckboxInput', 'FormRadioInput', 'FormFileUploadInput']);

function emptyResult(): WalkResult {
  return { instances: new Map(), instanceElements: [], forms: [], lists: [], embeds: 0, links: [], bindable: [], inputs: [] };
}

function idKey(el: AnyElement): string {
  const id = el.id as unknown;
  if (id && typeof id === 'object') {
    const o = id as Record<string, string>;
    return `${o.component ?? ''}:${o.element ?? ''}:${o.slot ?? ''}`;
  }
  return String(id);
}

/**
 * Walk an element tree, descending into component slots so nested components
 * (a Card inside a Slider slot, say) are counted too. Instances are not
 * entered: what lives inside a component definition belongs to the component.
 */
export async function walkTree(roots: AnyElement[], opts: { collectBindable?: boolean; maxElements?: number } = {}): Promise<WalkResult> {
  const out = emptyResult();
  const seen = new Set<string>();
  const queue: AnyElement[] = [...roots];
  const max = opts.maxElements ?? 6000;

  while (queue.length && seen.size < max) {
    const el = queue.shift()!;
    const key = idKey(el);
    if (seen.has(key)) continue;
    seen.add(key);
    const type = (el as { type?: string }).type ?? '';

    if (type === 'ComponentInstance') {
      const inst = el as ComponentElement;
      const comp = await safe(() => inst.getComponent(), null);
      if (comp) out.instances.set(comp.id, (out.instances.get(comp.id) ?? 0) + 1);
      out.instanceElements.push(inst);
      const slots = await safe(() => (has(inst, 'getSlots') ? inst.getSlots() : []), [] as SlotInstanceElement[]);
      for (const slot of slots) {
        const kids = await safe(() => slot.getChildren(), [] as AnyElement[]);
        queue.push(...kids);
      }
      continue;
    }

    if (type === 'FormForm') out.forms.push(el);
    else if (type === 'DynamoWrapper') out.lists.push(el);
    else if (type === 'HtmlEmbed' || type === 'CustomCode') out.embeds++;
    if (LINK_TYPES.has(type)) out.links.push(el);
    if (INPUT_TYPES.has(type)) out.inputs.push(el);
    if (opts.collectBindable && BINDABLE_TYPES.has(type)) out.bindable.push(el);

    if ((el as { children?: boolean }).children && has(el, 'getChildren')) {
      const kids = await safe(() => (el as unknown as { getChildren(): Promise<AnyElement[]> }).getChildren(), [] as AnyElement[]);
      queue.push(...kids);
    }
  }
  return out;
}

export interface LinkTarget {
  pageId?: string;
  path?: string;
  /** Absolute URLs. The orchestrator decides whether they point at this site. */
  url?: string;
}

/** Read where a link element points to. */
export async function readLinkTarget(el: AnyElement): Promise<LinkTarget | null> {
  if (!has(el, 'getResolvedSettings')) return null;
  const settings = await safe(
    () => (el as unknown as { getResolvedSettings(): Promise<Record<string, unknown>> }).getResolvedSettings(),
    {} as Record<string, unknown>,
  );
  for (const value of Object.values(settings)) {
    const t = linkValueToTarget(value);
    if (t) return t;
  }
  return null;
}

export function linkValueToTarget(value: unknown): LinkTarget | null {
  if (!value || typeof value !== 'object' || !('mode' in value)) return null;
  const v = value as { mode: string; to?: unknown };
  if (v.mode === 'page' && v.to && typeof v.to === 'object' && 'pageId' in v.to) return { pageId: String((v.to as { pageId: string }).pageId) };
  if (v.mode === 'url' && typeof v.to === 'string') {
    const to = v.to.trim();
    if (to.startsWith('/')) return { path: to.split(/[?#]/)[0].replace(/\/$/, '') || '/' };
    if (/^https?:\/\//i.test(to)) return { url: to };
    return null;
  }
  return null;
}

export function describeElement(type: string, extra?: string): string {
  const names: Record<string, string> = {
    String: 'Text',
    DOM: 'Custom element',
    Block: 'Div block',
    RichText: 'Rich text',
    YouTubeVideo: 'YouTube video',
    FormButton: 'Form button',
  };
  const label = names[type] ?? type;
  return extra ? `${label} (${extra})` : label;
}
