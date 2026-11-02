import type { Hub, Progress, ScanOptions } from '../types';
import { assembleHub } from './assemble';
import { scanCanvas, type CanvasScan } from './canvas';
import { readComponents } from './components';
import { DataApi, type DataApiResult } from './dataApi';
import { readPages, readSiteInfo } from './pages';

export async function buildHub(options: ScanOptions, progress: Progress, isCancelled: () => boolean = () => false): Promise<Hub> {
  const warnings: string[] = [];

  progress('Reading site details');
  const site = await readSiteInfo();

  progress('Reading pages and SEO settings');
  const pages = await readPages(site, (n, total) => progress('Reading pages and SEO settings', n, total));

  progress('Reading components and props');
  const comps = await readComponents(options.deepScan, (n, total) => progress('Reading components and props', n, total));

  let canvas: CanvasScan | null = null;
  if (options.deepScan) {
    canvas = await scanCanvas(pages, comps, (msg, done, total) => progress(msg, done, total), isCancelled);
  } else {
    warnings.push('Quick scan: run a full scan to see which components, forms and collection lists each page uses.');
  }

  let data: DataApiResult | null = null;
  if (options.dataApi?.token && options.dataApi.proxyUrl && site.id) {
    try {
      data = await new DataApi(options.dataApi.proxyUrl, options.dataApi.token).read(site.id, pages, (m) => progress(m));
    } catch (err) {
      warnings.push(`The Data API could not be reached (${(err as Error).message}). CMS details come from the canvas only.`);
    }
  }

  progress('Writing the Knowledge Hub');
  return assembleHub({ site, pages, components: comps.components, canvas, dataApi: data, warnings });
}
