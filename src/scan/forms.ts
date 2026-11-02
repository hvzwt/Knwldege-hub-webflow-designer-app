import type { FormUsage } from '../types';
import { has, safe, uniq } from '../util';
import { walkTree } from './walk';

/** Read a Webflow form: its name, settings and the inputs inside it. */
export async function readForm(form: AnyElement, insideComponent: string | null): Promise<FormUsage> {
  const f = form as unknown as {
    getName?: () => Promise<string>;
    getSettings?: () => Promise<Record<string, unknown>>;
  };
  const name = await safe(() => (f.getName ? f.getName() : ''), '');
  const settings: Record<string, unknown> = await safe(async () => (f.getSettings ? f.getSettings() : {}), {} as Record<string, unknown>);
  const inner = await walkTree([form], { maxElements: 400 });
  const fields = uniq(
    (
      await Promise.all(
        inner.inputs.map(async (input) => {
          if (!has(input, 'getResolvedSettings')) return '';
          const s = await safe(
            () => (input as unknown as { getResolvedSettings(): Promise<Record<string, unknown>> }).getResolvedSettings(),
            {} as Record<string, unknown>,
          );
          const pick = s.name ?? s.dataName ?? s.placeholder ?? s.label;
          const req = s.required === true ? ' (required)' : '';
          const type = typeof s.inputType === 'string' ? ` – ${s.inputType}` : '';
          return typeof pick === 'string' && pick ? `${pick}${type}${req}` : '';
        }),
      )
    ).filter(Boolean),
  );
  return {
    name: name || 'Unnamed form',
    fields: fields.length ? fields : inner.inputs.length ? [`${inner.inputs.length} input(s)`] : [],
    action: typeof settings.action === 'string' ? settings.action : '',
    redirect: typeof settings.redirect === 'string' ? settings.redirect : '',
    insideComponent,
  };
}
