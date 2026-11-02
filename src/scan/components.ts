import type { ComponentProp, ComponentRecord, FormUsage } from '../types';
import { has, mapLimit, safe, stringifyValue } from '../util';
import { readForm } from './forms';
import { linkValueToTarget, readLinkTarget, walkTree, type LinkTarget } from './walk';

export interface ComponentScan {
  components: ComponentRecord[];
  /** Links found inside each component definition (Navbar, Footer...). */
  links: Map<string, LinkTarget[]>;
  /** Forms that live inside a component definition. */
  forms: Map<string, FormUsage[]>;
  /** Child component id → parent component ids. */
  nestedIn: Map<string, Set<string>>;
}

export const PROP_TYPE_LABEL: Record<string, string> = {
  textContent: 'Text',
  string: 'Text',
  richText: 'Rich text',
  link: 'Link',
  image: 'Image',
  video: 'Video',
  number: 'Number',
  boolean: 'Switch (on/off)',
  variant: 'Variant',
  slot: 'Slot',
  id: 'ID',
  altText: 'Alt text',
  booleanFilter: 'Filter switch',
  visibility: 'Visibility',
  filter: 'Collection filter',
  sort: 'Collection sort',
  selectedItems: 'Selected items',
  headingTag: 'Heading level',
};

async function readProps(comp: AnyComponent): Promise<ComponentProp[]> {
  if (!has(comp, 'getProps')) return [];
  const props = await safe(() => comp.getProps(), [] as Prop[]);
  return props.map((p) => ({
    id: p.id,
    name: p.name,
    group: p.group ?? null,
    type: p.type,
    tooltip: p.tooltip ?? null,
    defaultValue: p.type === 'image' ? (p.defaultValue ? 'Default image set' : '') : stringifyValue(p.defaultValue),
  }));
}

export async function readComponents(withTrees: boolean, progress?: (n: number, total: number) => void): Promise<ComponentScan> {
  const all = await safe(() => webflow.getAllComponents(), [] as AnyComponent[]);
  const links = new Map<string, LinkTarget[]>();
  const forms = new Map<string, FormUsage[]>();
  const nestedIn = new Map<string, Set<string>>();
  let done = 0;

  const components = await mapLimit(all, 4, async (comp): Promise<ComponentRecord> => {
    const settings = await safe(
      () => (has(comp, 'getSettings') ? comp.getSettings() : null),
      null as ComponentSettings | null,
    );
    const name = settings?.name || (await safe(() => comp.getName(), 'Unnamed component'));
    const [props, variants, count] = await Promise.all([
      readProps(comp),
      safe(() => (has(comp, 'getVariants') ? comp.getVariants() : []), [] as Variant[]),
      safe(() => (has(comp, 'getInstanceCount') ? comp.getInstanceCount() : null), null as number | null),
    ]);

    if (withTrees) {
      const root = await safe(() => comp.getRootElement(), null);
      if (root) {
        const tree = await walkTree([root], { maxElements: 3000 });
        for (const childId of tree.instances.keys()) {
          if (!nestedIn.has(childId)) nestedIn.set(childId, new Set());
          nestedIn.get(childId)!.add(comp.id);
        }
        const targets = (await Promise.all(tree.links.map(readLinkTarget))).filter((t): t is LinkTarget => !!t);
        // Link props set on nested instances (a Button inside the Navbar, for example).
        for (const inst of tree.instanceElements) {
          const resolved = await safe(() => (has(inst, 'getResolvedProps') ? inst.getResolvedProps() : []), [] as ResolvedInstanceProp[]);
          for (const p of resolved) {
            const t = linkValueToTarget(p.value);
            if (t) targets.push(t);
          }
        }
        links.set(comp.id, targets);
        if (tree.forms.length) forms.set(comp.id, await Promise.all(tree.forms.map((f) => readForm(f, name))));
      }
    }

    progress?.(++done, all.length);
    return {
      id: comp.id,
      name,
      group: settings?.group ?? '',
      description: settings?.description ?? '',
      instanceCount: count,
      variants: variants.filter((v) => v.id !== 'base').map((v) => v.name),
      props,
      usedOn: [] as string[],
      nestedIn: [] as string[],
      fromLibrary: comp.library ? comp.library.name ?? 'Library' : null,
      isCodeComponent: comp.codeComponent === true,
      linksTo: (links.get(comp.id) ?? []).flatMap((t) => (t.pageId ? [t.pageId] : [])),
      linkPaths: (links.get(comp.id) ?? []).flatMap((t) => (t.path ? [t.path] : [])),
    } satisfies ComponentRecord;
  });

  const byId = new Map(components.map((c) => [c.id, c]));
  for (const [child, parents] of nestedIn) {
    const rec = byId.get(child);
    if (rec) rec.nestedIn = [...parents].map((p) => byId.get(p)?.name ?? p);
  }
  components.sort((a, b) => (a.group || '~').localeCompare(b.group || '~') || a.name.localeCompare(b.name));
  return { components, links, forms, nestedIn };
}

/** Display a component's name with its group, as the sheet does: "Footer (group: Global)". */
export function componentLabel(c: Pick<ComponentRecord, 'name' | 'group'>): string {
  return c.group ? `${c.name} (group: ${c.group})` : c.name;
}
