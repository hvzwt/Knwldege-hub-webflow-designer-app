import type { CollectionField, CollectionRecord, PageRecord } from '../types';

export const FIELD_TYPE_LABEL: Record<string, string> = {
  plainText: 'Plain Text',
  richText: 'Rich Text',
  image: 'Image',
  multiImage: 'Multi-Image',
  video: 'Video Link',
  url: 'Link',
  email: 'Email',
  phone: 'Phone',
  number: 'Number',
  date: 'Date/Time',
  boolean: 'Switch',
  color: 'Color',
  option: 'Option',
  file: 'File',
  itemRef: 'Reference',
  itemRefSet: 'Multi-Reference',
  slug: 'Plain Text (slug)',
  fullSlug: 'Plain Text (slug)',
  set: 'Multi-Reference',
  user: 'User',
  highlightedText: 'Rich Text',
};

export function fieldTypeLabel(f: CollectionField): string {
  const base = FIELD_TYPE_LABEL[f.type] ?? f.type;
  if (f.type === 'option' && f.options.length) return `${base} (${f.options.join(', ')})`;
  if ((f.type === 'itemRef' || f.type === 'itemRefSet') && f.referenceCollection) return `${base} → ${f.referenceCollection}`;
  return base;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function isNameField(f: CollectionField) {
  return f.slug === 'name' || f.id === 'name';
}
function isSlugField(f: CollectionField) {
  return f.type === 'slug' || f.type === 'fullSlug' || f.slug === 'slug';
}

/**
 * Short, practical instructions for an editor filling this field.
 * Returns [note for editors, helper text]. The helper text is written so a
 * developer can paste it into the field's Help Text in Webflow.
 */
export function fieldGuidance(f: CollectionField, c: CollectionRecord): { note: string; helper: string } {
  const n = f.name.toLowerCase();
  const v = f.validations;
  const maxLen = num(v.maxLength);
  const minLen = num(v.minLength);
  const item = c.singularName || 'item';
  const notes: string[] = [];
  const helper: string[] = [];

  if (isNameField(f)) {
    notes.push('No leading, trailing or double spaces');
    helper.push(`The ${item}'s title, shown on cards and as the page heading. No leading, trailing or double spaces.`);
  } else if (isSlugField(f)) {
    if (c.templatePublished) {
      notes.push('Changing it breaks existing links');
      helper.push(`Part of the URL: ${c.templatePath?.replace('[item-slug]', '[slug]') ?? '/[slug]'}. Filled in from the name automatically. Lowercase words joined by hyphens. Changing it after publishing breaks existing links.`);
    } else {
      notes.push('Item identifier (no page published for this collection)');
      helper.push('Item identifier. Filled in from the name automatically; no need to change it.');
    }
  } else if (/meta ?title|seo ?title/.test(n)) {
    notes.push('50–60 characters');
    helper.push(`SEO title shown in Google and the browser tab, about 50–60 characters, e.g. "${item[0].toUpperCase() + item.slice(1)} title | ${c.name}".`);
  } else if (/meta ?desc|seo ?desc/.test(n)) {
    notes.push('140–160 characters');
    helper.push('SEO description shown in Google results, about 140–160 characters.');
  } else if (/\balt\b|alt text/.test(n)) {
    notes.push('Always fill for accessibility');
    helper.push("Short description of the image for screen readers. Don't start with 'Image of'.");
  } else if (/(sort|order|index|priority|position)/.test(n) && f.type === 'number') {
    notes.push('Lower number shows first');
    helper.push('Lower numbers show first (1 = first). Leave gaps (10, 20, 30) so new items can be slotted in.');
  }

  switch (f.type) {
    case 'plainText':
      if (/summary|excerpt|intro|short/.test(n)) {
        notes.push(`Max ${maxLen ?? 200} characters`);
        helper.push(`One or two sentences (max ${maxLen ?? 200} characters).`);
      } else if (maxLen) {
        notes.push(`Max ${maxLen} characters`);
      }
      if (/email/.test(n) === false && /url|link/.test(n)) notes.push('Paste the full address including https://');
      if (!helper.length && !isNameField(f) && !isSlugField(f)) helper.push('Plain text. Paste as plain text (Ctrl/Cmd+Shift+V) to avoid hidden formatting.');
      break;
    case 'richText':
    case 'highlightedText':
      notes.push('Use H2/H3 for subheadings, not bold paragraphs');
      helper.push('Use the toolbar: H2/H3 for subheadings, real bullet lists, and the link button for links. Paste from Word or Google Docs as plain text first.');
      break;
    case 'image':
      notes.push('Compressed JPG/WebP; always set alt text');
      helper.push('Upload a compressed image (WebP or JPG, ideally under 500 KB). Set descriptive alt text in the image settings.');
      break;
    case 'multiImage':
      notes.push('Max 25 images; set alt text on each');
      helper.push('Add up to 25 compressed images. Set alt text on each image.');
      break;
    case 'video':
      notes.push('YouTube or Vimeo link');
      helper.push('Paste the YouTube or Vimeo page URL (not the embed code).');
      break;
    case 'url':
      notes.push('Full URL with https://; no tracking tags');
      helper.push('Full link including https://. Use clean links, without utm_ tags, session tokens or "safelinks" wrappers.');
      break;
    case 'email':
      notes.push('One valid email address');
      helper.push('A single valid email address, e.g. name@example.com.');
      break;
    case 'phone':
      notes.push('Include the area code');
      helper.push('Phone number including the area code, e.g. +1 416 555 0100.');
      break;
    case 'number': {
      const min = num(v.minValue ?? v.min);
      const max = num(v.maxValue ?? v.max);
      const range = [min !== null ? `min ${min}` : '', max !== null ? `max ${max}` : ''].filter(Boolean).join(', ');
      const decimals = v.format === 'integer' || num(v.precision) === 0 ? 'whole numbers only' : '';
      const extra = [range, decimals].filter(Boolean).join('; ');
      if (extra) notes.push(extra);
      if (!helper.length) helper.push(`Numbers only${extra ? ` (${extra})` : ''}.`);
      break;
    }
    case 'date':
      notes.push("Uses the site's time zone");
      if (/end|until|closing|expire/.test(n)) helper.push("Last day to show. Double-check the year. Times use the site's time zone.");
      else helper.push("Pick the date (and time, if it matters). Times use the site's time zone.");
      break;
    case 'boolean':
      if (/hide|archiv|inactive/.test(n)) {
        notes.push('Use instead of deleting');
        helper.push('On = hidden from the site, without deleting the item.');
      } else if (/active|show|visible|featured|publish/.test(n)) {
        notes.push('Off hides it without deleting');
        helper.push('On = shown on the site. Turn off instead of deleting.');
      } else {
        helper.push('On/off switch.');
      }
      break;
    case 'color':
      notes.push('Hex colour, e.g. #1A2B3C');
      helper.push('Hex colour code, e.g. #1A2B3C. Check text on top of it stays readable (WCAG AA 4.5:1).');
      break;
    case 'option':
      notes.push(f.options.length ? `Pick one of: ${f.options.join(', ')}` : 'Pick one option');
      notes.push('Ask a developer to add new options');
      helper.push(f.options.length ? `Pick one: ${f.options.join(', ')}.` : 'Pick one option from the list.');
      break;
    case 'file':
      notes.push('PDF or document; keep files small');
      helper.push('Upload the file (usually a PDF). Re-upload here when the document changes.');
      break;
    case 'itemRef':
      notes.push(`Pick one ${f.referenceCollection ?? 'linked'} item; add it there first if it's missing`);
      helper.push(`Choose one item from ${f.referenceCollection ?? 'the linked collection'}.`);
      break;
    case 'itemRefSet':
    case 'set':
      notes.push(`Pick every ${f.referenceCollection ?? 'linked'} item that applies`);
      helper.push(`Choose all items from ${f.referenceCollection ?? 'the linked collection'} that apply.`);
      break;
  }

  if (minLen) notes.push(`At least ${minLen} characters`);
  if (f.required === false && !notes.some((x) => /optional/i.test(x))) notes.push('Optional');

  return {
    note: notes.join('; '),
    helper: f.helpText ? f.helpText : helper.join(' '),
  };
}

/** Where a field shows up on the site, from template bindings and collection lists. */
export function fieldMapping(f: CollectionField, c: CollectionRecord, template: PageRecord | undefined): string {
  const out: string[] = [];
  if (isSlugField(f)) {
    return c.templatePublished && c.templatePath ? `Item URL: ${c.templatePath.replace('[item-slug]', '[slug]')}` : 'Item identifier (template page not published)';
  }
  const bindings = template?.scan?.bindings.filter((b) => b.fieldName.toLowerCase() === f.name.toLowerCase()) ?? [];
  if (bindings.length) out.push(`${[...new Set(bindings.map((b) => b.element))].join(', ')} on ${template!.name}`);
  if (template && /meta ?title|seo ?title/i.test(f.name)) out.push(`SEO title of ${template.name}`);
  if (template && /meta ?desc|seo ?desc/i.test(f.name)) out.push(`SEO meta description of ${template.name}`);
  if (!out.length && c.listedOn.length && isNameField(f)) out.push(`Card title in lists on ${c.listedOn.map((l) => l.split(' (')[0]).join(', ')}`);
  return out.join('; ');
}

/** Step-by-step instructions for adding and maintaining items in a collection. */
export function collectionSteps(c: CollectionRecord): string[] {
  const item = c.singularName || 'item';
  const required = c.fields.filter((f) => f.required).map((f) => f.name);
  const sortField = c.fields.find((f) => f.type === 'number' && /(sort|order|index|priority)/i.test(f.name));
  const hideField = c.fields.find((f) => f.type === 'boolean' && /(hide|active|show|visible)/i.test(f.name));
  const steps = [
    `Open the CMS panel in Webflow (the stacked-database icon in the left toolbar) and choose "${c.name}".`,
    `Click "New ${item}". Fill in every required field${required.length ? `: ${required.join(', ')}` : ''}.`,
    'Use the guidance next to each field below. Images: compress them first and always add alt text.',
  ];
  if (sortField) steps.push(`To control the order, set "${sortField.name}" (lower numbers show first).`);
  steps.push(`Click "Save as draft" to keep working, or "Publish" to make the ${item} live straight away. Items marked "Staged" go live the next time the whole site is published.`);
  if (c.templatePublished && c.templatePath) steps.push(`Each ${item} gets its own page at ${c.templatePath.replace('[item-slug]', '[slug]')}.`);
  else steps.push(`This collection has no live page of its own; its items only appear inside lists and sections on other pages.`);
  if (c.listedOn.length) steps.push(`After publishing, check it appears on: ${c.listedOn.map((l) => l.split(' (')[0]).join(', ')}.`);
  steps.push(
    hideField
      ? `To take an ${item} down, use the "${hideField.name}" switch rather than deleting it.`
      : `To take an ${item} down, use "Archive" instead of deleting, so it can be restored later.`,
  );
  return steps;
}
