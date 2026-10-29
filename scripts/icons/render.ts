// Renders icon.svg to the PNG sizes the manifest needs. Run with `pnpm icons`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const SIZES = [16, 32, 48, 128];
const svg = await readFile(path.join(import.meta.dirname, 'icon.svg'), 'utf8');
const outDir = path.resolve(import.meta.dirname, '../../packages/extension/public/icon');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium' });
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    await writeFile(path.join(outDir, `${size}.png`), png);
    await page.close();
    console.log(`icon/${size}.png`);
  }
} finally {
  await browser.close();
}
