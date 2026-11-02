import { render } from 'preact';
import { App } from './ui/App';
import './styles.css';

async function start() {
  const root = document.getElementById('app')!;
  const inDesigner = typeof (globalThis as { webflow?: unknown }).webflow !== 'undefined';
  if (!inDesigner) {
    // Local preview outside Webflow: show the UI with sample data.
    const { demoHub } = await import('./demo');
    render(<App siteId="demo-site" siteName="Sample site" demoHub={demoHub()} />, root);
    return;
  }
  const theme = await webflow.getTheme().catch(() => 'darkDefault');
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  const info = await webflow.getSiteInfo().catch(() => null);
  render(<App siteId={info?.siteId ?? 'unknown-site'} siteName={info?.siteName ?? 'This site'} />, root);
}

void start();
