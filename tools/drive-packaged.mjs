#!/usr/bin/env node
/** Verify the actual fused executable through Chromium CDP without enabling Node inspection. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { passPermissionPreflight } from './permission-preflight.mjs';

const executable = path.resolve(process.argv[2] ?? 'dist/linux-unpacked/whisperer');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisperer-packaged-'));
const socket = http.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const child = spawn(executable, [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []), `--remote-debugging-port=${port}`], {
  env: { ...process.env, WHISPERER_DESKTOP_DATA_DIR: path.join(directory, 'profile') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stderr.on('data', (data) => { logs += data.toString(); });
let browser;
try {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 }); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  assert.ok(browser, `Packaged app did not expose Chromium: ${logs.slice(-1500)}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent('page');
  const capture = path.resolve('artifacts/desktop');
  fs.mkdirSync(capture, { recursive: true });
  await page.waitForFunction(() => Boolean(window.whisperer), null, { timeout: 20000 });
  await passPermissionPreflight(page, (checklist) => checklist.screenshot({ path: path.join(capture, `packaged-${process.platform}-permissions-check.png`) }));
  await page.getByRole('button', { name: /sign in.*browser/i }).waitFor({ timeout: 20000 });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => 'ipcRenderer' in window.whisperer), false);
  const state = await page.evaluate(() => window.whisperer.bootstrap());
  assert.equal(state.settings.authenticated, false);
  assert.ok(page.url().startsWith('whisperer://local/'));
  await page.screenshot({ path: path.join(capture, `packaged-${process.platform}-sign-in.png`) });
  console.log(`Packaged ${process.platform} executable rendered sign-in with the sandboxed bridge and no session.`);
} catch (error) { console.error(error); console.error(logs.slice(-2000)); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  await new Promise((resolve) => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
  clearTimeout(timer);
  fs.rmSync(directory, { recursive: true, force: true });
}
