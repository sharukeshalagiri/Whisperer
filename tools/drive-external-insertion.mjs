#!/usr/bin/env node
/** Drive repeated real X11 external-textarea insertion against loopback-only fixtures. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
import { chromium } from 'playwright';
import { desktopFixture } from './desktop-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'whisperer-external-insertion-'));
const capture = path.join(root, 'artifacts', 'desktop');
const transcripts = Array.from({ length: 21 }, (_, index) => {
  const label = `Synthetic external dictation ${index + 1}.`;
  return index % 3 === 0
    ? `${label} This deliberately long first line makes the persisted history row wrap across the actual desktop layout.\nA second synthetic line verifies preserved newlines in a real X11 textarea.\nA third synthetic line keeps the fixture free of user content.`
    : index % 3 === 1
      ? `${label} Medium synthetic content verifies a second text size.`
      : label;
});
let transcriptIndex = 0;
const fixture = await desktopFixture({ transcriptionText: () => transcripts[transcriptIndex++] ?? transcripts.at(-1) });
let desktop;
let browser;
let externalServer;

/** Wait for an asynchronous predicate without relying on renderer focus. */
async function waitFor(predicate, message = 'Desktop state did not reach the expected value within 20 seconds.') {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

/** Execute one fixed X11 command with no shell interpolation. */
function x11(...arguments_) {
  return execFileSync('xdotool', arguments_.map(String), { encoding: 'utf8', timeout: 5000 }).trim();
}

/** Find and activate one visible browser window using its fixture-only title. */
async function focusExternal(page, name) {
  await page.bringToFront();
  const windowId = x11('search', '--onlyvisible', '--name', name).split(/\s+/u).at(-1);
  assert.ok(windowId, `The ${name} external test window is unavailable.`);
  x11('windowactivate', '--sync', windowId);
  return windowId;
}

/** Confirm the physical X11 foreground window is exactly the selected external page. */
async function focusTextarea(page, name) {
  const windowId = await focusExternal(page, name);
  await page.getByLabel('External dictation target').focus();
  assert.equal(x11('getwindowfocus'), windowId, 'The external textarea did not own X11 focus.');
  return windowId;
}

/** Select fixture-only text in the external textarea while preserving physical X11 focus. */
async function selectTextarea(page, name, text) {
  await focusTextarea(page, name);
  await page.getByLabel('External dictation target').evaluate((element, value) => {
    const input = /** @type {HTMLTextAreaElement} */ (element);
    input.value = value;
    input.focus();
    input.select();
  }, text);
  await desktop.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
}

/** Focus the owned hub natively so main can attest review ownership before restoration. */
async function focusHub() {
  await desktop.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes('#/overlay') && !window.webContents.getURL().includes('#/scratchpad'))?.focus();
  });
  await waitFor(async () => await desktop.evaluate(({ BrowserWindow }) => {
    const focused = BrowserWindow.getFocusedWindow();
    return Boolean(focused?.isFocused() && !focused.webContents.getURL().includes('#/overlay') && !focused.webContents.getURL().includes('#/scratchpad'));
  }), 'The hub did not become the focused owned review window.');
}

/** Start and complete one fake-microphone dictation while a caller controls X11 focus. */
async function dictate(hub, beforeStop) {
  const historyLength = (await hub.evaluate(() => window.whisperer.history.list())).length;
  x11('key', '--clearmodifiers', 'ctrl+alt+space');
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).recording.status === 'recording', 'The external global shortcut did not start dictation.');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await beforeStop();
  x11('key', '--clearmodifiers', 'ctrl+alt+space');
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.history.list())).length === historyLength + 1, 'Completed dictation was not persisted.');
  return (await hub.evaluate(() => window.whisperer.history.list()))[0];
}

if (process.platform !== 'linux' || process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland') {
  console.warn('Skipping external insertion acceptance: this driver needs a Linux X11 session with xdotool.');
  fs.rmSync(temporary, { recursive: true, force: true });
  process.exit(0);
}
if (!process.env.DISPLAY) {
  console.error('External insertion acceptance needs DISPLAY. Run it in a real X11 session, or use xvfb-run with an EWMH-capable window manager.');
  fs.rmSync(temporary, { recursive: true, force: true });
  process.exit(1);
}

try {
  x11('--version');
  fs.mkdirSync(capture, { recursive: true });
  externalServer = http.createServer((request, response) => {
    const title = new URL(request.url, 'http://localhost').pathname === '/decoy'
      ? 'Whisperer external decoy'
      : 'Whisperer external target';
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><title>${title}</title><label>External dictation target<textarea aria-label="External dictation target" autofocus></textarea></label>`);
  });
  await new Promise((resolve) => externalServer.listen(0, '127.0.0.1', resolve));
  const externalUrl = `http://127.0.0.1:${externalServer.address().port}`;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: false, args: ['--no-sandbox'] });
  const targetPage = await browser.newPage();
  const decoyPage = await browser.newPage();
  await targetPage.goto(externalUrl);
  await decoyPage.goto(`${externalUrl}/decoy`);

  desktop = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream', root],
    env: { ...process.env, WHISPERER_DESKTOP_DATA_DIR: path.join(temporary, 'desktop') },
    timeout: 45000,
  });
  await desktop.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
  const hub = await desktop.firstWindow();
  await hub.waitForFunction(() => Boolean(window.whisperer));
  await hub.getByRole('button', { name: /sign in.*browser/i }).waitFor({ timeout: 20000 });
  await hub.getByLabel(/server URL/i).fill(fixture.url);
  await hub.getByRole('button', { name: /sign in.*browser/i }).click();
  await waitFor(async () => Boolean((await hub.evaluate(() => window.whisperer.bootstrap())).user), 'Loopback fixture sign-in did not complete.');
  await hub.evaluate(() => window.whisperer.settings.update({ autoPaste: true, onboardingCompleted: true, transformsEnabled: true }));
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).settings.onboardingCompleted, 'Onboarding test gate did not resolve.');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const targetWindow = await focusTextarea(targetPage, 'Whisperer external target');
    const completed = await dictate(hub, async () => {
      assert.equal(x11('getwindowfocus'), targetWindow, 'Global shortcut handling moved focus before completion.');
    });
    assert.equal(completed.text, transcripts[attempt]);
    assert.equal(completed.pasted, true, 'A still-focused external textarea must record a successful paste.');
  }
  const expectedRepeatedText = transcripts.slice(0, 20).join('');
  assert.equal(await targetPage.getByLabel('External dictation target').inputValue(), expectedRepeatedText, 'Repeated dictation did not arrive in the external textarea.');

  await focusTextarea(targetPage, 'Whisperer external target');
  const fallback = await dictate(hub, async () => {
    await focusTextarea(decoyPage, 'Whisperer external decoy');
  });
  assert.equal(fallback.pasted, false, 'Changed external focus must fail closed instead of claiming a paste.');
  assert.equal(await targetPage.getByLabel('External dictation target').inputValue(), expectedRepeatedText, 'Focus fallback modified the original target.');
  assert.equal(await decoyPage.getByLabel('External dictation target').inputValue(), '', 'Focus fallback pasted into an unrelated external textarea.');
  assert.equal(fallback.text, transcripts[20]);
  assert.equal(execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8', timeout: 5000 }), fallback.text, 'Failed automatic insertion must retain the completed text on the X11 clipboard.');
  await waitFor(() => fixture.metrics.size === 21, 'Completed dictations did not reach the loopback metrics fixture.');
  const metrics = await hub.evaluate(() => window.whisperer.metrics.get());
  assert.ok(metrics.totalWords > 0, 'Loopback metrics did not include completed dictations.');

  for (const transformSource of [
    'Synthetic selected source with the same fixture clipboard value.',
    'Second synthetic selection confirms repeated review restoration.',
    'Third synthetic selection confirms X11 review timing.',
  ]) {
    await selectTextarea(targetPage, 'Whisperer external target', transformSource);
    const transformReview = await hub.evaluate(() => window.whisperer.transformations.start('polish'));
    assert.equal(transformReview.sourceText, transformSource, 'The transform did not capture the selected external text.');
    const generatedTransform = await hub.evaluate((sessionId) => window.whisperer.transformations.generate(sessionId), transformReview.sessionId);
    assert.equal(generatedTransform.proposal, `Proposed: ${transformSource}`);
    await focusHub();
    await hub.evaluate((sessionId) => window.whisperer.transformations.accept(sessionId), transformReview.sessionId);
    await waitFor(async () => (await targetPage.getByLabel('External dictation target').inputValue()) === `Proposed: ${transformSource}`, 'Accepted transform did not restore and replace the original external selection.');
  }

  for (const nativeSource of [
    'Synthetic native Polish selection one.',
    'Synthetic native Polish selection two.',
    'Synthetic native Polish selection three.',
  ]) {
    await selectTextarea(targetPage, 'Whisperer external target', nativeSource);
    await hub.evaluate(() => {
      const state = /** @type {{ reviews: unknown[]; dispose?: () => void }} */ (globalThis.__externalTransformReviewState ?? { reviews: [] });
      state.dispose?.();
      state.reviews = [];
      state.dispose = window.whisperer.events.onTransformReview((review) => state.reviews.push(review));
      globalThis.__externalTransformReviewState = state;
    });
    x11('key', '--clearmodifiers', 'alt+1');
    await waitFor(async () => (await hub.evaluate(() => globalThis.__externalTransformReviewState.reviews.length)) === 1, 'Native Alt+1 did not emit exactly one Polish review.');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const reviews = await hub.evaluate(() => globalThis.__externalTransformReviewState.reviews);
    assert.equal(reviews.length, 1, 'One native Alt+1 press must not start duplicate Polish sessions.');
    assert.equal(reviews[0].sourceText, nativeSource, 'Native Alt+1 did not capture the external selection.');
    const generated = await hub.evaluate((sessionId) => window.whisperer.transformations.generate(sessionId), reviews[0].sessionId);
    assert.equal(generated.proposal, `Proposed: ${nativeSource}`);
    await focusHub();
    await hub.evaluate((sessionId) => window.whisperer.transformations.accept(sessionId), reviews[0].sessionId);
    await waitFor(async () => (await targetPage.getByLabel('External dictation target').inputValue()) === `Proposed: ${nativeSource}`, 'Native Alt+1 review did not replace its original external selection.');
  }

  await hub.evaluate(() => window.whisperer.settings.update({ transformsEnabled: false }));
  await waitFor(async () => !(await hub.evaluate(() => window.whisperer.bootstrap())).settings.transformsEnabled, 'Transform opt-out did not reach the main settings service.');
  assert.equal(await desktop.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Alt+1')), false, 'Transform opt-out must unregister Alt+1.');
  await selectTextarea(targetPage, 'Whisperer external target', 'Synthetic opt-out selection.');
  await hub.evaluate(() => { globalThis.__externalTransformReviewState.reviews = []; });
  x11('key', '--clearmodifiers', 'alt+1');
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await hub.evaluate(() => globalThis.__externalTransformReviewState.reviews.length), 0, 'Opted-out Alt+1 must not start a transform review.');
  assert.equal(await targetPage.getByLabel('External dictation target').inputValue(), 'Synthetic opt-out selection.', 'Opted-out Alt+1 must not alter the external selection.');

  const changedSource = 'Synthetic source before an external edit.';
  const editedSource = 'Synthetic source changed while the review was open.';
  await selectTextarea(targetPage, 'Whisperer external target', changedSource);
  const changedReview = await hub.evaluate(() => window.whisperer.transformations.start('polish'));
  await hub.evaluate((sessionId) => window.whisperer.transformations.generate(sessionId), changedReview.sessionId);
  await focusHub();
  await targetPage.getByLabel('External dictation target').evaluate((element, value) => {
    const input = /** @type {HTMLTextAreaElement} */ (element);
    input.value = value;
    input.select();
  }, editedSource);
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => Boolean(BrowserWindow.getFocusedWindow())), true, 'Changing a fixture textarea through CDP must not steal review focus.');
  await assert.rejects(() => hub.evaluate((sessionId) => window.whisperer.transformations.accept(sessionId), changedReview.sessionId), /original selection changed/i);
  assert.equal(await targetPage.getByLabel('External dictation target').inputValue(), editedSource, 'Changed selection must not be overwritten by an accepted transform.');

  const decoySource = 'Synthetic source before review focus changed.';
  await selectTextarea(targetPage, 'Whisperer external target', decoySource);
  const decoyReview = await hub.evaluate(() => window.whisperer.transformations.start('polish'));
  await hub.evaluate((sessionId) => window.whisperer.transformations.generate(sessionId), decoyReview.sessionId);
  await focusHub();
  await focusTextarea(decoyPage, 'Whisperer external decoy');
  await assert.rejects(() => hub.evaluate((sessionId) => window.whisperer.transformations.accept(sessionId), decoyReview.sessionId), /review window lost focus/i);
  assert.equal(await targetPage.getByLabel('External dictation target').inputValue(), decoySource, 'A review-focus change must not restore or overwrite the original target.');
  assert.equal(await decoyPage.getByLabel('External dictation target').inputValue(), '', 'A review-focus change must never write to an unrelated external textarea.');

  await hub.evaluate(() => { location.hash = '#/home'; });
  await waitFor(async () => (await hub.locator('.dictation-stats dd').first().innerText()) === String(metrics.totalWords), 'Home metrics did not refresh after persisted dictation history changed.');
  await hub.getByText(transcripts[18], { exact: true }).first().waitFor();
  await hub.screenshot({ path: path.join(capture, 'external-insertion-history-wrapping.png') });
  console.log('External X11 insertion acceptance passed: 20 repeated target pastes, changed-focus fail-closed fallback, clipboard retention, three bridge and three native-Alt+1 review-gated replacements, Alt+1 opt-out unregistration, and long multiline persisted history screenshot.');
} catch (error) {
  console.error('Desktop text at external insertion failure:', await desktop?.windows()[0]?.locator('body').innerText().catch(() => 'unavailable'));
  console.error(error);
  process.exitCode = 1;
} finally {
  await desktop?.close();
  await browser?.close();
  await fixture.close();
  if (externalServer) await new Promise((resolve, reject) => externalServer.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(temporary, { recursive: true, force: true });
}
