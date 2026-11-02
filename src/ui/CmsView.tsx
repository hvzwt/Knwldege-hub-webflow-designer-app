import { useState } from 'preact/hooks';
import { collectionSteps, fieldGuidance, fieldMapping, fieldTypeLabel } from '../guide/fieldGuide';
import type { Hub, Notes } from '../types';

interface Props {
  hub: Hub;
  notes: Notes;
  onNote: (key: string, value: string) => void;
}

export function CmsView({ hub, notes, onNote }: Props) {
  const [open, setOpen] = useState<string | null>(hub.collections[0]?.id ?? null);
  if (!hub.collections.length) return <p class="muted pad">This site has no CMS collections.</p>;

  return (
    <div class="cms">
      <p class="muted small">
        {hub.collections.length} collections. Open one to see how editors add content and what every field does.
        {!hub.sources.dataApi && ' Connect the Data API in Settings to list every field with its required flag and help text.'}
      </p>
      {hub.collections.map((c) => {
        const isOpen = open === c.id;
        const template = hub.pages.find((p) => p.id === c.templatePageId);
        return (
          <section key={c.id} class={`card ${isOpen ? 'open' : ''}`}>
            <button class="card-head" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
              <span>
                <b>{c.name}</b> <span class="muted mono">/{c.slug}</span>
              </span>
              <span class="badges">
                <span class="badge strong">{c.itemCount ?? '?'} items</span>
                <span class="badge">{c.fields.length} fields</span>
                {c.templatePath && <span class={`badge ${c.templatePublished ? '' : 'dim'}`}>{c.templatePublished ? 'Has item pages' : 'Template off'}</span>}
              </span>
              <span class="caret">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div class="card-body">
                <dl class="facts">
                  <div>
                    <dt>Item page URL</dt>
                    <dd class="mono">{c.templatePublished && c.templatePath ? c.templatePath.replace('[item-slug]', '[slug]') : 'No item pages'}</dd>
                  </div>
                  <div>
                    <dt>Shown on</dt>
                    <dd>{c.listedOn.length ? c.listedOn.join('; ') : hub.sources.canvas ? 'Not shown in any Collection List' : 'Run a full scan'}</dd>
                  </div>
                  {c.liveItemCount !== null && (
                    <div>
                      <dt>Published items</dt>
                      <dd>
                        {c.liveItemCount} of {c.itemCount}
                      </dd>
                    </div>
                  )}
                </dl>
                <h4>How to add a new {c.singularName || 'item'}</h4>
                <ol class="steps">
                  {collectionSteps(c).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <h4>Fields</h4>
                <ul class="fields">
                  {c.fields.map((f) => {
                    const g = fieldGuidance(f, c);
                    const map = fieldMapping(f, c, template);
                    const key = `cms:${c.id}:${f.id}`;
                    return (
                      <li key={f.id}>
                        <div class="field-head">
                          <b>{f.name}</b>
                          <span class="badge">{fieldTypeLabel(f)}</span>
                          {f.required && <span class="badge req">Required</span>}
                        </div>
                        {g.helper && <p>{g.helper}</p>}
                        {g.note && <p class="muted small">Editor tip: {g.note}</p>}
                        {map && <p class="muted small">Shows up as: {map}</p>}
                        <textarea rows={1} class="inline-note" placeholder="Add a note for editors" value={notes[key] ?? ''} onInput={(e) => onNote(key, (e.target as HTMLTextAreaElement).value)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
