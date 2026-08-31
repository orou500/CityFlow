import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'C:\\Users\\Or Moshe\\Desktop\\Projects\\SizOps\\client';

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', '3000', '--strictPort'],
  { cwd: BASE, stdio: 'ignore' },
);
await new Promise((r) => setTimeout(r, 5000));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

await page.goto('http://localhost:3000/', { waitUntil: 'load', timeout: 30000 }).catch((e) => consoleErrors.push('NAV: ' + e.message));
await new Promise((r) => setTimeout(r, 2500));

const dump = await page.evaluate(() => ({
  title: document.title,
  rootHtml: (document.getElementById('root')?.innerHTML ?? '').slice(0, 400),
  interstitial: !!document.querySelector('.interstitial-wrapper'),
  bodyClasses: document.body.className,
}));
console.log(JSON.stringify(dump, null, 1));
console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 1));

await browser.close();
server.kill();
process.exit(0);
