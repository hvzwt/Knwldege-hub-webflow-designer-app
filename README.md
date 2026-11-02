# Knowledge Hub – Webflow Designer Extension

A Designer Extension that documents the site it's opened on, so a finished
website can be handed over with a complete knowledge hub in one click.

It is **read-only**: it never changes the site. A test (`test/readonly.test.ts`)
fails the build if any Designer API method that writes to a site appears in the code.

## What the hub covers

| Section | What it shows |
| --- | --- |
| **Overview** | Counts of static pages, dynamic (CMS item) pages, CMS template pages, utility and draft pages, collections, CMS items, components and forms, plus a "worth fixing before handover" list (missing meta descriptions, orphan pages, published internal pages, blank CMS templates, undocumented components, fields without help text, empty collections). |
| **Page Inventory & SEO** | URL, page title, page type (with folder), CMS collection, SEO title and meta description, components used (with counts), forms, custom code, redirects pointer, indexing, orphan status and notes ("Linked in Navbar and Footer", "Meta description missing"…). |
| **CMS** | Every collection with its slug, item count (and live count), item page URL, the pages and lists it appears on (with sort/filter), a step-by-step "how to add a new item" guide, and every field with its type, options, references, where it shows up on the template, an editor tip and ready-to-paste help text. |
| **Component Inventory** | Each component with its group, purpose, the pages it's used on (with counts), what it's nested inside, variants, and every prop with its type. |
| **Custom Code & Forms** | Forms (including forms inside components, like a footer newsletter), Code Embed elements per page, links to external systems (Amilia, Wix forms, Microsoft Forms, eTapestry, Eventbrite…), and, with the Data API, site and page scripts. Code pasted into Site/Page settings can't be read by any Webflow API, so there's a form to add it by hand. |

Every row can carry a note, and notes are included in all exports.

**Exports:** a spreadsheet (.xlsx) with the same tabs as the handover sheet, a
standalone client handbook (.html, prints to PDF), Markdown, JSON, CSV, and a
"copy" button per tab that pastes straight into Google Sheets.

## How it reads the site

1. **Designer API (always).** Pages, folders, page kinds and SEO/Open Graph
   settings; components with settings, props, variants and instance counts.
2. **Full scan (on by default).** Opens each page in the canvas and walks its
   elements, including component slots: component usage, forms, Code Embeds,
   Collection Lists (collection names, fields, option values, item totals,
   sort/filter), CMS field bindings on template pages, and links (for orphan
   detection). The Designer moves between pages while this runs and returns to
   your page at the end.
3. **Data API (optional).** The Designer API can't read every CMS field's
   required flag and help text, item counts for collections not shown on any
   page, or applied scripts. Add a site token with read-only scopes
   (`sites:read pages:read cms:read custom_code:read forms:read`) and a proxy
   URL in **Settings**. The proxy is needed because the Data API doesn't accept
   calls from the extension's iframe; `proxy/` contains a Cloudflare Worker and a
   zero-dependency Node server, both of which only forward `GET` requests.

## Develop

```bash
npm install
npm run dev        # rebuilds into dist/ and serves it on http://localhost:1337
```

In Webflow: **Apps → Your app → Launch development app**, with the dev URL above.
Opening `npm run preview` in a normal browser shows the UI with sample data.

```bash
npm test           # scanners against a mocked Designer API, guidance, exports, read-only guard
npm run typecheck
npm run bundle     # builds and creates bundle.zip to upload in the Webflow app settings
```

## Structure

```
src/scan/        Designer API readers (pages, components, canvas walk, forms, Data API) and assemble.ts which merges them
src/guide/       Content-entry guidance per field type and per collection
src/report/      Builds the hub tables (same columns as the handover sheet) and findings
src/export/      xlsx / html / markdown / csv / tsv / json
src/ui/          Preact UI
proxy/           Read-only Data API proxy (Cloudflare Worker or Node)
test/            Vitest suite with a mocked `webflow` global
```
