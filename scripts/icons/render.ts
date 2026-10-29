// Renders icon.svg (and icon-16.svg for 16 px) to the PNG sizes the manifest needs. Run with `pnpm icons`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const SIZES = [16, 32, 48, 128];
const read = (file: string) => readFile(path.join(import.meta.dirname, file), 'utf8');
// 16 px uses a simplified logo so the details stay readable.
const full = await read('icon.svg');
const small = await read('icon-16.svg');
const outDir = path.resolve(import.meta.dirname, '../../packages/extension/public/icon');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium' });
try {
  for (const size of SIZES) {
    const svg = size === 16 ? small : full;
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
