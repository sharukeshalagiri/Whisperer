#!/usr/bin/env node
/** Drive the actual desktop against a loopback fixture using a disposable profile. Pass --verbose for diagnostic dumps. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
import { desktopFixture } from './desktop-fixture.mjs';
import { passPermissionPreflight } from './permission-preflight.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'whisperer-drive-'));
const capture = path.join(root, 'artifacts', 'desktop');
fs.mkdirSync(capture, { recursive: true });
const fixture = await desktopFixture();
let desktop;
const errors = [];
const verbose = process.argv.includes('--verbose');

/** Prints one diagnostic record only under --verbose. Args: label names the record; value is JSON-serializable. */
function debugLog(label, value) {
  if (verbose) console.log(label, JSON.stringify(value));
}

/** Wait for an asynchronous desktop predicate. Args: predicate reads IPC state. Returns: nothing when true. Raises: timeout. */
/** Wait for a separate owned page. Args: app is the Electron instance; pattern selects its URL. Returns: the loaded page. */
async function waitForWindow(app, pattern) {
  let result;
  await waitFor(async () => {
    result = app.windows().find((page) => pattern.test(page.url()));
    return Boolean(result);
  });
  await result.waitForLoadState();
  return result;
}

async function waitFor(predicate, message = 'Desktop state did not reach the expected value within 20 seconds.') {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

/** Clicks an onboarding permission only when this platform exposes an enabled action, then checks its reported resolution. */
async function resolveOnboardingPermission(page, capabilityId, buttonName) {
  const action = page.getByRole('button', { name: buttonName, exact: true });
  if (await action.count()) {
    assert.equal(await action.isEnabled(), true, `${buttonName} must be enabled when it is shown.`);
    await action.click();
  }
  const capability = (await page.evaluate(() => window.whisperer.bootstrap())).capabilities[capabilityId];
  assert.ok(
    !capability.supported || capability.granted || capability.reason,
    `${capabilityId} must report either a grant or an honest platform reason.`,
  );
}

/** Captures both explicit themes and verifies the setting reached the real main-process boundary. */
async function captureThemes(page, name) {
  for (const theme of ['light', 'dark']) {
    const state = await page.evaluate(async (nextTheme) => {
      await window.whisperer.settings.update({ theme: nextTheme });
      return window.whisperer.bootstrap();
    }, theme);
    assert.equal(state.settings.theme, theme);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(capture, `${name}-${theme}.png`) });
  }
}

/** Checks the landing serif metrics, local day groups, wrapped rows and hover or focus actions. */
async function verifyLandingHistory(page) {
  await page.evaluate(() => document.fonts.ready);
  const landing = await page.evaluate(() => ({
    serif: document.fonts.check('22px "IBM Plex Serif"'),
    metricFont: getComputedStyle(document.querySelector('.dictation-stats dd')).fontFamily,
    statsText: document.querySelector('.dictation-stats').textContent,
    group: document.querySelector('.dictation-history__group h3')?.textContent,
    time: document.querySelector('.dictation-history li time')?.textContent,
    wrap: getComputedStyle(document.querySelector('.dictation-history__text')).whiteSpace,
    avatar: Boolean(document.querySelector('.account-avatar svg')),
  }));
  assert.equal(landing.serif, true, 'IBM Plex Serif did not load from the packaged font.');
  assert.match(landing.metricFont, /IBM Plex Serif/);
  assert.doesNotMatch(landing.statsText, /Source/);
  assert.equal(landing.group, 'Today');
  assert.match(landing.time, /^\d{1,2}:\d{2}(am|pm)$/);
  assert.equal(landing.wrap, 'pre-wrap');
  assert.equal(landing.avatar, true);
  const row = page.locator('.dictation-history li').first();
  const actions = row.locator('.dictation-history__actions');
  await page.mouse.move(0, 0);
  await waitFor(async () => (await actions.evaluate((node) => getComputedStyle(node).opacity)) === '0', 'History actions must stay hidden until a row is hovered.');
  await row.hover();
  await waitFor(async () => (await actions.evaluate((node) => getComputedStyle(node).opacity)) === '1', 'History actions did not appear on hover.');
  await page.mouse.move(0, 0);
  await row.getByRole('button', { name: 'Copy dictation', exact: true }).focus();
  await waitFor(async () => (await actions.evaluate((node) => getComputedStyle(node).opacity)) === '1', 'History actions did not appear on keyboard focus.');
}

/** Checks the Insights grid renders every card from the account metrics and a paged heat map of daily words. */
async function verifyInsightsPage(page) {
  await page.locator('.heat-map__cell[style*="background-color"]').first().waitFor();
  const insights = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.metric-card')].map((card) => card.getAttribute('aria-label')),
    cells: document.querySelectorAll('.heat-map__grid .heat-map__cell').length,
    shaded: new Set([...document.querySelectorAll('.heat-map__grid .heat-map__cell')].map((cell) => cell.style.backgroundColor)).size,
    months: document.querySelectorAll('.heat-map__month-track span').length,
    apps: document.querySelectorAll('.insights-apps li').length,
    gauge: getComputedStyle(document.querySelector('.wpm-gauge__fill')).strokeDashoffset,
  }));
  assert.deepEqual(insights.cards.slice(0, 4), ['Words per minute', 'Fixes made by Whisperer', 'Total words dictated', 'Apps dictated into']);
  assert.ok(insights.cells >= 7 * 15 && insights.cells <= 7 * 16, `The current heat-map page must cover sixteen Sunday-based weeks, got ${insights.cells} cells.`);
  assert.ok(insights.shaded >= 4, 'Synthetic daily words must shade the heat map across several levels.');
  assert.ok(insights.months >= 3, 'Sixteen weeks must label at least three months.');
  assert.equal(insights.apps, 2);
  await captureThemes(page, 'ui-insights');
  await page.getByRole('button', { name: 'Earlier weeks', exact: true }).click();
  await waitFor(() => page.getByRole('button', { name: 'Later weeks', exact: true }).isEnabled(), 'Paging back must enable the later-weeks control.');
  assert.equal((await page.evaluate(() => document.querySelectorAll('.heat-map__grid .heat-map__cell').length)), 7 * 16, 'An earlier page holds exactly sixteen whole weeks.');
  await page.getByRole('button', { name: 'Later weeks', exact: true }).click();
}

/** Creates, autosaves, persists and deletes a custom Transform through the page, capturing both themes. */
async function verifyTransformsPage(page) {
  await page.evaluate(() => { location.hash = '#/transforms'; });
  await page.getByRole('heading', { name: 'Transforms', exact: true }).waitFor();
  for (const name of ['Polish', 'Prompt Engineer', 'Decompose']) {
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).waitFor();
  }
  await captureThemes(page, 'ui-transforms');
  await page.getByRole('button', { name: /Create your own/ }).click();
  const editor = page.getByRole('dialog');
  await editor.waitFor();
  await captureThemes(page, 'ui-transform-editor');
  await editor.getByPlaceholder('Boss mode').fill('Synthetic transform');
  await editor.locator('textarea').fill('Rewrite the synthetic text as a short list.');
  await editor.locator('.shortcut-recorder__field').click();
  await editor.locator('.shortcut-recorder[data-capturing="true"] .shortcut-recorder__field').dispatchEvent('keydown', { altKey: true, bubbles: true, cancelable: true, code: 'Digit7', key: '7' });
  await editor.locator('.shortcut-recorder[data-capturing="true"] .shortcut-recorder__field').dispatchEvent('keyup', { altKey: true, bubbles: true, cancelable: true, code: 'Digit7', key: '7' });
  await waitFor(async () => (await page.evaluate(() => window.whisperer.transformations.list())).some((item) => item.name === 'Synthetic transform'), 'A complete custom Transform did not autosave.');
  await editor.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  const saved = (await page.evaluate(() => window.whisperer.transformations.list())).filter((item) => item.name === 'Synthetic transform');
  assert.equal(saved.length, 1, 'Closing the editor after autosave must not create a duplicate Transform.');
  assert.match(saved[0].shortcut, /alt.*7/i);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Synthetic transform', exact: true }).click();
  await waitFor(async () => !(await page.evaluate(() => window.whisperer.transformations.list())).some((item) => item.name === 'Synthetic transform'), 'Deleting a custom Transform did not persist.');
}

/** Returns the overlay's native bounds and focus status without exposing Electron to the renderer. */
async function overlayWindowState(app) {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes('#/overlay'));
    if (!window) return null;
    const bounds = window.getBounds();
    return { bounds, focused: window.isFocused(), visible: window.isVisible(), workArea: screen.getDisplayMatching(bounds).workArea };
  });
}

/** Accepts the bottom offset or a side target 18 px inside the edge, which a narrow vertical bar reaches unclamped. */
function isDockedOverlay({ bounds, workArea }) {
  const centerX = bounds.x + bounds.width / 2;
  return Math.abs(bounds.x - workArea.x) <= 1 || Math.abs(centerX - (workArea.x + 18)) <= 5
    || Math.abs(bounds.x + bounds.width - (workArea.x + workArea.width)) <= 1 || Math.abs(centerX - (workArea.x + workArea.width - 18)) <= 5
    || Math.abs(bounds.y + bounds.height / 2 - (workArea.y + workArea.height - 23)) <= 5;
}

/** Requires the reference CSS dimensions on the visible pill, not its transparent native hit area. */
function assertPillDimensions(box, width, height, label) {
  assert.ok(box, `${label} pill is not visible.`);
  assert.ok(Math.abs(box.width - width) <= 0.6, `${label} pill width should be ${width}px, received ${box.width}px.`);
  assert.ok(Math.abs(box.height - height) <= 0.6, `${label} pill height should be ${height}px, received ${box.height}px.`);
}

/** Sends an X11 pointer action because Chromium CDP pointer coordinates do not update Electron's screen cursor. */
function x11Pointer(...arguments_) {
  execFileSync('xdotool', arguments_.map((argument) => typeof argument === 'number' ? String(Math.round(argument)) : argument), {
    stdio: 'ignore',
    timeout: 5000,
  });
}

/** Positions the real X11 cursor at a screen coordinate. */
function moveX11Cursor(x, y) {
  x11Pointer('mousemove', x, y);
}

/** Finds the dedicated visible finish icon because the drag surface carries a second Finish and paste label. */
async function recordingFinishButton(page) {
  const finish = page.locator('.recording-pill__finish').last();
  await finish.waitFor();
  return finish;
}

/** Captures a real DOM keyboard chord in the shared shortcut recorder. */
async function captureShortcut(page, action, key = 'K') {
  const row = page.locator(`[data-shortcut-action="${action}"]`);
  await row.waitFor();
  const field = row.locator('.shortcut-recorder__field');
  await field.click();
  const recorder = row.locator('.shortcut-recorder[data-capturing="true"]');
  await recorder.waitFor();
  await recorder.getByRole('button', { name: /Recording .+ shortcut/i }).waitFor();
  await recorder.dispatchEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: `Key${key}`,
    ctrlKey: true,
    key,
    shiftKey: true,
  });
  await recorder.dispatchEvent('keyup', {
    bubbles: true,
    cancelable: true,
    code: `Key${key}`,
    ctrlKey: true,
    key,
    shiftKey: true,
  });
  return row;
}

/** Sends the selected persisted accelerator through DOM events for the onboarding key-highlighter. */
async function dispatchSelectedShortcut(target, binding, afterKeyDown = async () => {}) {
  const tokens = String(Array.isArray(binding) ? binding[0] ?? '' : binding)
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const has = (...names) => tokens.some((token) => names.includes(token.toLowerCase()));
  const key = tokens.find((token) => !['alt', 'control', 'ctrl', 'command', 'meta', 'super', 'commandorcontrol', 'shift'].includes(token.toLowerCase()));
  const flags = { alt: false, control: false, meta: false, shift: false };
  const eventFor = (eventKey, code) => ({
    altKey: flags.alt,
    bubbles: true,
    cancelable: true,
    code,
    ctrlKey: flags.control,
    key: eventKey,
    metaKey: flags.meta,
    shiftKey: flags.shift,
  });
  await target.focus();
  if (!key) {
    const modifiers = [
      ['control', 'Control', 'ControlLeft'],
      ['command', 'Meta', 'MetaLeft'],
      ['super', 'Meta', 'MetaLeft'],
      ['alt', 'Alt', 'AltLeft'],
      ['shift', 'Shift', 'ShiftLeft'],
    ];
    const pressed = [];
    for (const [name, eventKey, code] of modifiers) {
      if (!has(name, name === 'control' ? 'ctrl' : name)) continue;
      flags[name === 'command' || name === 'super' ? 'meta' : name] = true;
      const event = eventFor(eventKey, code);
      await target.dispatchEvent('keydown', event);
      pressed.push(event);
    }
    await afterKeyDown();
    for (const event of pressed.reverse()) await target.dispatchEvent('keyup', event);
    return;
  }
  flags.alt = has('alt');
  flags.control = has('control', 'ctrl', 'commandorcontrol');
  flags.meta = has('command', 'meta', 'super');
  flags.shift = has('shift');
  const normalizedKey = key.toLowerCase() === 'space' ? ' ' : key;
  const code = key.toLowerCase() === 'space' ? 'Space' : key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const event = eventFor(normalizedKey, code);
  await target.dispatchEvent('keydown', event);
  await afterKeyDown();
  await target.dispatchEvent('keyup', event);
}

/** Verifies every settings shortcut action remains an operable accessible control. */
async function verifyShortcutActions(page) {
  const actions = ['holdToTalk', 'toggleRecording', 'pressEnter', 'pasteLastTranscript', 'copyLastTranscript', 'scratchpad', 'startMeeting', 'transform', 'transformView', 'cancel'];
  for (const action of actions) {
    const row = page.locator(`[data-shortcut-action="${action}"]`);
    assert.equal(await row.count(), 1, `Expected one ${action} shortcut row.`);
    assert.ok(await row.getByRole('button').count(), `Expected ${action} shortcut row to contain a button.`);
  }
}

/** Exercises the shortcut dialog through its controls and validates conflict feedback before saving. */
async function verifyShortcutRecorder(page) {
  await verifyShortcutActions(page);
  const holdRow = page.locator('[data-shortcut-action="holdToTalk"]');
  await holdRow.getByRole('button', { name: 'Add another Push to talk shortcut' }).click();
  const added = holdRow.locator('.shortcut-recorder[data-capturing="true"]');
  await added.waitFor();
  assert.equal(await added.locator('.shortcut-recorder__hint').innerText(), 'Click to add a shortcut', 'Adding a shortcut should open the empty field directly in capture mode.');
  assert.equal(await added.getByRole('button', { name: 'Change Push to talk shortcut' }).count(), 1, 'The empty shortcut field should retain its edit control while capturing.');
  await added.locator('.shortcut-recorder__field').press('Escape');
  await waitFor(async () => (await holdRow.locator('.shortcut-recorder[data-capturing="true"]').count()) === 0, 'Empty shortcut capture did not close after Escape.');

  const ptt = await captureShortcut(page, 'holdToTalk');
  await waitFor(async () => {
    // macOS includes its modifier glyphs in the visible chip labels.
    const chips = (await ptt.locator('.shortcut-chip').allTextContents())
      .map((chip) => chip.replace(/^[⌃⌘⌥⇧]\s*/u, '').trim());
    return chips.some((chip) => /^(ctrl|control)$/i.test(chip)) && chips.some((chip) => /^shift$/i.test(chip)) && chips.some((chip) => /^k$/i.test(chip));
  }, 'Push-to-talk shortcut was not rendered as key chips.');
  const saved = await page.evaluate(() => window.whisperer.bootstrap());
  const holdToTalk = saved.settings.shortcutBindings?.holdToTalk ?? saved.settings.shortcut;
  const savedBinding = Array.isArray(holdToTalk) ? holdToTalk.join('+') : String(holdToTalk);
  assert.match(savedBinding, /(?:ctrl|control).*(?:shift).*k/i, 'Shortcut save did not reach the main-process settings service.');
  await page.screenshot({ path: path.join(capture, 'ui-shortcut-captured.png') });

  await captureShortcut(page, 'toggleRecording');
  const conflictAlert = page.getByRole('alert').filter({ hasText: 'This shortcut is already in use' });
  await conflictAlert.waitFor();
  assert.match(await conflictAlert.innerText(), /This shortcut is already in use/i);
  await page.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await captureThemes(page, 'ui-shortcuts-dialog');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
}

/** Drives cancellation, completion, waveform updates, and persisted native overlay placement. */
async function verifyOverlay(app, hub) {
  await hub.evaluate(() => window.whisperer.settings.update({ showStatusBar: true, theme: 'dark' }));
  const overlay = await waitForWindow(app, /#\/overlay$/);
  await overlay.getByRole('complementary', { name: 'Dictation status' }).waitFor();
  await waitFor(async () => (await overlayWindowState(app))?.visible === true, 'Status overlay did not become visible.');
  const idle = await overlayWindowState(app);
  assert.ok(idle);
  assert.equal(idle.focused, false);
  const pill = overlay.locator('.recording-pill');
  assertPillDimensions(await pill.boundingBox(), 40, 8, 'Idle');
  const bodyBackground = await overlay.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.match(bodyBackground, /transparent|rgba\([^)]*,\s*0\)/i, 'Overlay body must remain transparent around the themed pill.');
  await overlay.screenshot({ path: path.join(capture, 'ui-overlay-idle.png') });
  // The hovered pill offers the first transform beside the mic, which the overlay may run in place.
  await hub.evaluate(() => window.whisperer.settings.update({ transformsEnabled: true }));
  await waitFor(async () => Boolean((await hub.evaluate(() => window.whisperer.bootstrap())).quickTransform), 'The first transform was not offered on the pill.');
  if (process.platform === 'linux') {
    // Hover grows the window toward the screen interior, so only a real cursor keeps its screen position.
    const restingBounds = (await overlayWindowState(app))?.bounds;
    const restingBox = await pill.boundingBox();
    assert.ok(restingBounds && restingBox);
    moveX11Cursor(restingBounds.x + restingBox.x + restingBox.width / 2, restingBounds.y + restingBox.y + restingBox.height / 2);
    await overlay.getByRole('button', { name: /^Apply / }).waitFor();
    // Notetaker and the first transform are separate circles; hovering one slides out its named tooltip.
    const notetaker = overlay.getByRole('button', { name: 'Start Notetaker', exact: true });
    await waitFor(async () => {
      const bounds = (await overlayWindowState(app))?.bounds;
      const box = await notetaker.boundingBox({ timeout: 1000 }).catch(() => null);
      if (!bounds || !box) return false;
      moveX11Cursor(bounds.x + box.x + box.width / 2, bounds.y + box.y + box.height / 2);
      // The bar grows on hover, so keep aiming until the button itself is under the cursor.
      return overlay.evaluate(() => Boolean(document.querySelector('[aria-label="Start Notetaker"]')?.matches(':hover')));
    }, 'Start Notetaker was not reachable on the hovered pill.');
    const notetakerTip = overlay.locator('.recording-overlay__slot', { has: notetaker }).locator('.recording-overlay__tip');
    await waitFor(async () => Number(await notetakerTip.evaluate((tip) => getComputedStyle(tip).opacity)) > 0.9, 'Hovering Start Notetaker did not reveal its tooltip.');
    assert.match(await notetakerTip.innerText(), /Start Notetaker/);
    await overlay.screenshot({ path: path.join(capture, 'ui-overlay-ready-transform.png') });
    const away = await overlayWindowState(app);
    moveX11Cursor(away.workArea.x + 2, away.workArea.y + 2);
    await waitFor(async () => (await overlay.getByRole('button', { name: 'Start Notetaker', exact: true }).count()) === 0, 'Leaving the pill did not hide its hover actions.');
  } else {
    console.warn('Skipping pill hover action assertion: Electron exposes no portable API to move the operating-system cursor outside X11.');
  }

  const historyBeforeCancel = (await hub.evaluate(() => window.whisperer.history.list())).length;
  const metricsBeforeCancel = fixture.metrics.size;
  const transcriptionsBeforeCancel = fixture.requests.filter(({ path: requestPath }) => requestPath === '/v1/transcriptions').length;
  await hub.getByRole('button', { name: 'Start recording', exact: true }).click();
  await overlay.getByRole('button', { name: 'Cancel recording', exact: true }).waitFor();
  await waitFor(async () => {
    const box = await pill.boundingBox();
    return Boolean(box && Math.abs(box.width - 102.5) <= 0.6 && Math.abs(box.height - 30) <= 0.6);
  }, 'Hands-free recording pill did not expand.');
  const recording = await overlayWindowState(app);
  assert.ok(recording);
  assertPillDimensions(await pill.boundingBox(), 102.5, 30, 'Hands-free recording');
  assert.equal(recording.focused, false);
  const waveform = overlay.locator('.recording-pill__waveform');
  await waveform.waitFor();
  assert.equal(await waveform.locator(':scope > *').count(), 10, 'Compact recording waveform must expose ten PCM-driven bars.');
  const firstHeights = await waveform.locator(':scope > *').evaluateAll((bars) => bars.map((bar) => Math.round(bar.getBoundingClientRect().height)));
  await waitFor(async () => {
    const heights = await waveform.locator(':scope > *').evaluateAll((bars) => bars.map((bar) => Math.round(bar.getBoundingClientRect().height)));
    return heights.some((height, index) => height !== firstHeights[index]);
  }, 'Waveform bars did not respond to Chromium fake-microphone PCM frames.');
  await overlay.screenshot({ path: path.join(capture, 'ui-overlay-recording-cancel.png') });
  await overlay.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).recording.status === 'idle', 'Cancel did not end recording.');
  await hub.waitForTimeout(300);
  assert.equal((await hub.evaluate(() => window.whisperer.history.list())).length, historyBeforeCancel);
  assert.equal(fixture.metrics.size, metricsBeforeCancel);
  assert.equal(fixture.requests.filter(({ path: requestPath }) => requestPath === '/v1/transcriptions').length, transcriptionsBeforeCancel);

  await hub.getByRole('button', { name: 'Start recording', exact: true }).click();
  const finish = await recordingFinishButton(overlay);
  await waveform.waitFor();
  await finish.click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.history.list())).length === historyBeforeCancel + 1, 'Stop did not persist exactly one dictation.');
  await waitFor(() => fixture.metrics.size === metricsBeforeCancel + 1, 'Stop did not persist exactly one numerical metric.');

  const dragRegion = overlay.locator('[data-drag-surface]');
  await dragRegion.waitFor();
  if (process.platform === 'linux') {
    // Submission completes before the overlay renderer consumes the final state. Start only once its visual pill and native hit area agree.
    const pill = overlay.locator('.recording-pill');
    // Park the cursor first: the hovered bar is wider, so measuring it would aim at a spot the resting bar does not cover.
    const parked = await overlayWindowState(app);
    moveX11Cursor(parked.workArea.x + 2, parked.workArea.y + 2);
    await waitFor(async () => {
      const bounds = (await overlayWindowState(app))?.bounds;
      const box = await pill.boundingBox();
      const resting = box && Math.abs(box.width - 40) <= 0.6 && Math.abs(box.height - 8) <= 0.6 && bounds?.width === 60 && bounds.height === 20;
      return (await overlay.locator('.recording-overlay').getAttribute('data-recording-status')) === 'idle' && Boolean(resting);
    }, 'Completed dictation did not settle the overlay before native dragging.');
    const entered = await overlayWindowState(app);
    const enteredBox = await dragRegion.boundingBox();
    assert.ok(entered && enteredBox);
    const enteredX = entered.bounds.x + enteredBox.x + enteredBox.width / 2;
    const enteredY = entered.bounds.y + enteredBox.y + enteredBox.height / 2;
    moveX11Cursor(entered.workArea.x + 2, entered.workArea.y + 2);
    await overlay.evaluate(() => {
      const surface = document.querySelector('[data-drag-surface]');
      if (!surface) throw new Error('Drag surface is unavailable.');
      surface.removeAttribute('data-acceptance-pointer-move');
      surface.addEventListener('pointermove', () => surface.setAttribute('data-acceptance-pointer-move', 'true'), { once: true });
    });
    moveX11Cursor(enteredX, enteredY);
    await waitFor(() => overlay.locator('[data-drag-surface]').getAttribute('data-acceptance-pointer-move'), 'Native X11 cursor did not reach the idle drag surface.');
    // The physical X11 movement alone makes the pill ready; acquire the resized native hit area before pressing.
    await waitFor(async () => {
      const bounds = (await overlayWindowState(app))?.bounds;
      const box = await pill.boundingBox();
      // Hover adds the action circles and transparent tooltip room, so the native window outgrows the 70x42 hit area.
      return Boolean(bounds && box && Math.abs(box.width - 50) <= 0.6 && Math.abs(box.height - 30) <= 0.6 && bounds.width > 70 && bounds.height >= 42);
    }, 'Hovered overlay did not synchronize its visual pill and native hit area.');
    const beforeDrag = await overlayWindowState(app);
    assert.ok(beforeDrag);
    const dragBox = await dragRegion.boundingBox();
    assert.ok(dragBox);
    const startX = beforeDrag.bounds.x + dragBox.x + dragBox.width / 2;
    const startY = beforeDrag.bounds.y + dragBox.y + dragBox.height / 2;
    const endX = beforeDrag.workArea.x + 2;
    const endY = beforeDrag.workArea.y + beforeDrag.workArea.height - 2;
    debugLog('Native X11 drag start:', { bounds: beforeDrag.bounds, dragBox, startX, startY, endX, endY });
    moveX11Cursor(startX, startY);
    await overlay.evaluate(() => {
      const surface = document.querySelector('[data-drag-surface]');
      if (!surface) throw new Error('Drag surface is unavailable.');
      surface.removeAttribute('data-acceptance-pointer-down');
      surface.removeAttribute('data-acceptance-pointer-cancel');
      surface.addEventListener('pointerdown', (event) => surface.setAttribute('data-acceptance-pointer-down', String(event.pointerId)), { once: true });
      surface.addEventListener('pointercancel', () => surface.setAttribute('data-acceptance-pointer-cancel', 'true'), { once: true });
    });
    x11Pointer('mousedown', 1);
    await waitFor(() => overlay.locator('[data-drag-surface]').getAttribute('data-acceptance-pointer-down'), 'Native X11 press did not reach the drag surface.');
    const pointerId = Number(await dragRegion.getAttribute('data-acceptance-pointer-down'));
    await overlay.waitForFunction((id) => document.querySelector('[data-drag-surface]')?.hasPointerCapture(id), pointerId);
    await overlay.evaluate(({ x, y }) => {
      const surface = document.querySelector('[data-drag-surface]');
      if (!surface) throw new Error('Drag surface is unavailable.');
      surface.removeAttribute('data-acceptance-pointer-move');
      surface.addEventListener('pointermove', (event) => {
        if (Math.hypot(event.screenX - x, event.screenY - y) > 5) surface.setAttribute('data-acceptance-pointer-move', 'true');
      }, { once: true });
    }, { x: startX, y: startY });
    moveX11Cursor(endX, endY);
    await waitFor(() => overlay.locator('[data-drag-surface]').getAttribute('data-acceptance-pointer-move'), 'Native X11 movement did not reach the captured drag surface.');
    await waitFor(async () => {
      const bounds = (await overlayWindowState(app))?.bounds;
      return Boolean(bounds && (bounds.x !== beforeDrag.bounds.x || bounds.y !== beforeDrag.bounds.y));
    }, 'Dragging the overlay did not change native window geometry.');
    assert.equal(await dragRegion.getAttribute('data-acceptance-pointer-cancel'), null, 'Moving the native overlay must not cancel the captured pointer gesture.');
    await overlay.evaluate(() => {
      const surface = document.querySelector('[data-drag-surface]');
      if (!surface) throw new Error('Drag surface is unavailable.');
      surface.removeAttribute('data-acceptance-pointer-up');
      // React receives this bubble at its root before document, so this marker confirms endDrag sent its IPC request.
      document.addEventListener('pointerup', () => surface.setAttribute('data-acceptance-pointer-up', 'true'), { once: true });
    });
    x11Pointer('mouseup', 1);
    await waitFor(() => overlay.locator('[data-drag-surface]').getAttribute('data-acceptance-pointer-up'), 'Native X11 release did not reach the captured drag surface.');
    try {
      await waitFor(async () => {
        const moved = await overlayWindowState(app);
        return Boolean(moved && isDockedOverlay(moved));
      }, 'Native X11 release did not snap the overlay to a reference edge.');
    } catch (error) {
      debugLog('Native X11 unsnapped state:', { bounds: (await overlayWindowState(app))?.bounds, cancelled: await dragRegion.getAttribute('data-acceptance-pointer-cancel'), released: await dragRegion.getAttribute('data-acceptance-pointer-up') });
      throw error;
    }
    assert.equal((await hub.evaluate(() => window.whisperer.bootstrap())).recording.status, 'idle', 'Dragging the pill must not start dictation.');
    const moved = await overlayWindowState(app);
    assert.ok(moved);
    const movedBounds = moved.bounds;
    const snappedToEdge = isDockedOverlay(moved);
    debugLog('Native X11 drag end:', { movedBounds, workArea: moved.workArea, snappedToEdge });
    assert.ok(snappedToEdge, 'Dragged overlay did not snap to a reference edge offset.');
    // A side dock turns the bar 90 degrees so it runs along the screen edge.
    const dockEdge = (await hub.evaluate(() => window.whisperer.bootstrap())).overlayDockEdge;
    if (dockEdge !== 'bottom') {
      await waitFor(async () => (await overlay.locator('.recording-overlay').getAttribute('data-dock-edge')) === dockEdge, 'The pill did not learn its new dock edge.');
      // The pill animates its size, so wait for the swapped dimensions to settle.
      await waitFor(async () => {
        const sideBox = await overlay.locator('.recording-pill').boundingBox();
        return Boolean(sideBox && sideBox.height > sideBox.width);
      }, `A ${dockEdge}-docked pill must be vertical.`);
      // Side hover stacks the actions along the edge and slides tooltips toward the screen interior.
      const docked = await overlayWindowState(app);
      const dockedBox = await overlay.locator('.recording-pill').boundingBox();
      moveX11Cursor(docked.bounds.x + dockedBox.x + dockedBox.width / 2, docked.bounds.y + dockedBox.y + dockedBox.height / 2);
      const sideNotetaker = overlay.getByRole('button', { name: 'Start Notetaker', exact: true });
      const sideTip = overlay.locator('.recording-overlay__slot', { has: sideNotetaker }).locator('.recording-overlay__tip');
      // The bar grows on hover, so keep aiming at the button until its tooltip has slid out.
      await waitFor(async () => {
        const bounds = (await overlayWindowState(app))?.bounds;
        const box = await sideNotetaker.boundingBox({ timeout: 1000 }).catch(() => null);
        if (bounds && !box) {
          const pillBox = await overlay.locator('.recording-pill').boundingBox();
          if (pillBox) moveX11Cursor(bounds.x + pillBox.x + pillBox.width / 2, bounds.y + pillBox.y + pillBox.height / 2);
        }
        if (!bounds || !box) return false;
        moveX11Cursor(bounds.x + box.x + box.width / 2, bounds.y + box.y + box.height / 2);
        return Number(await sideTip.evaluate((tip) => getComputedStyle(tip).opacity)) > 0.9;
      }, 'The side-docked tooltip did not slide out.');
      const [tipBox, buttonBox] = [await sideTip.boundingBox(), await sideNotetaker.boundingBox()];
      assert.ok(tipBox && buttonBox && (dockEdge === 'left' ? tipBox.x > buttonBox.x + buttonBox.width : tipBox.x + tipBox.width < buttonBox.x), 'The side-docked tooltip must open toward the screen interior.');
      await overlay.screenshot({ path: path.join(capture, 'ui-overlay-side-hover.png') });
      moveX11Cursor(docked.workArea.x + docked.workArea.width / 2, docked.workArea.y + 2);
      await waitFor(async () => (await sideNotetaker.count()) === 0, 'Leaving the side-docked pill did not hide its actions.');
    }
    await overlay.screenshot({ path: path.join(capture, 'ui-overlay-dragged.png') });
    await hub.evaluate(() => window.whisperer.settings.update({ showStatusBar: false }));
    await waitFor(async () => (await overlayWindowState(app))?.visible === false, 'Overlay did not hide.');
    await hub.evaluate(() => window.whisperer.settings.update({ showStatusBar: true }));
    await waitFor(async () => (await overlayWindowState(app))?.visible === true, 'Overlay did not reopen.');
    assert.deepEqual((await overlayWindowState(app))?.bounds, movedBounds, 'Overlay placement was not retained after hide and reopen.');
  } else {
    console.warn('Skipping native overlay drag assertion: Electron exposes no portable API to move the operating-system cursor outside X11.');
  }
}

/**
 * Checks the fixture's release feed by hand and follows the notice from the bell and from Settings.
 *
 * Args:
 *   app: Electron instance whose shell.openExternal records URLs.
 *   hub: Signed-in hub page.
 * Returns: Nothing once the notice, its links and the Settings row behave.
 */
async function verifyUpdateNotice(app, hub) {
  const bell = hub.getByRole('button', { name: /^Notifications/ });
  assert.equal(await bell.getAttribute('aria-label'), 'Notifications', 'No update may be announced before a check.');
  const status = await hub.evaluate(() => window.whisperer.updates.check());
  assert.equal(status.error, null);
  assert.equal(status.update?.version, '99.0.0-beta.1');
  const arch = { x64: process.platform === 'linux' ? 'amd64' : 'x64', arm64: 'arm64' }[process.arch];
  const os = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
  assert.equal(status.update.assetName, `Whisperer-99.0.0-beta.1-${os}-${arch}.${{ mac: 'dmg', win: 'exe', linux: 'deb' }[os]}`);
  await hub.getByRole('button', { name: 'Notifications, update available' }).click();
  const popover = hub.getByRole('dialog', { name: 'Notifications' });
  await popover.getByText('Whisperer 99.0.0-beta.1 is available').waitFor();
  await hub.screenshot({ path: path.join(capture, 'update-notification.png') });
  // Sign-in already opened its login URL through the same stub.
  await app.evaluate(() => { globalThis.openedExternal.length = 0; });
  await popover.getByRole('button', { name: /^Download/ }).click();
  await popover.getByRole('button', { name: 'Release notes' }).click();
  await waitFor(async () => (await app.evaluate(() => globalThis.openedExternal.length)) === 2, 'Update links did not open.');
  assert.deepEqual(await app.evaluate(() => globalThis.openedExternal.splice(0)), [status.update.downloadUrl, status.update.pageUrl]);
  await hub.getByRole('button', { name: 'Notifications, update available' }).click();
  await hub.evaluate(() => { location.hash = '#/settings?section=system'; });
  const row = hub.locator('.settings-row', { hasText: 'Updates' });
  await row.getByText(/99\.0\.0-beta\.1 is available/).waitFor();
  await hub.screenshot({ path: path.join(capture, 'update-settings.png') });
  await hub.evaluate(() => { location.hash = '#/dictation'; });
}

/** Opens Settings › MCP and proves the endpoint derives from the saved server and copies to the clipboard. */
async function verifyMcpSettings(app, hub, serverUrl) {
  await hub.evaluate(() => { location.hash = '#/settings?section=mcp'; });
  await hub.getByRole('heading', { name: 'MCP', level: 1 }).waitFor();
  const endpoint = `${serverUrl.replace(/\/+$/, '')}/mcp`;
  assert.equal((await hub.getByTestId('mcp-endpoint').textContent())?.trim(), endpoint);
  const lede = await hub.locator('.settings-mcp__lede').textContent();
  assert.match(lede ?? '', /no access to dictation/);
  for (const name of ['Add to Claude', 'Add to Codex', 'Add to Cursor', 'Add to Gemini CLI', 'Add to another app']) {
    await hub.locator('.settings-row', { hasText: name }).waitFor();
  }
  await app.evaluate(({ clipboard }) => clipboard.writeText(''));
  await hub.locator('.settings-row', { hasText: 'Add to Claude' }).getByRole('button', { name: 'Copy' }).click();
  await waitFor(async () => (await app.evaluate(({ clipboard }) => clipboard.readText())) !== '', 'The MCP command was not copied.');
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), `claude mcp add --transport http whisperer ${endpoint}`);
  await hub.locator('.settings-row', { hasText: 'Add to another app' }).locator('summary').click();
  await hub.getByTestId('mcp-other-steps').waitFor();
  await hub.screenshot({ path: path.join(capture, 'ui-settings-mcp.png') });
  await hub.evaluate(() => { location.hash = '#/dictation'; });
}

/**
 * Records whether the backend-switch animation ever starts, from now on. When `window.shellWatch.freeze`
 * is set, it pauses every running animation the moment the ripple mounts, before its first paint, so
 * frames can then be seeked to exact times.
 */
async function watchShell(page) {
  await page.evaluate(() => {
    window.shellWatch?.observer.disconnect();
    const watch = { ripple: false, leaving: false, freeze: false, observer: null };
    watch.observer = new MutationObserver(() => {
      if (document.querySelector('.app-shell[data-transition="leaving"]')) watch.leaving = true;
      const ripple = document.querySelector('.shell-ripple');
      if (!ripple || watch.ripple) return;
      watch.ripple = true;
      if (watch.freeze) for (const animation of document.getAnimations()) animation.pause();
    });
    watch.observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-transition'] });
    window.shellWatch = watch;
  });
}

/**
 * Decodes two screenshots in the renderer and counts the pixels that differ in each part of the
 * shell. The page is the rounded `.page-scroll` box inset by 2 px for anti-aliasing.
 *
 * Returns: Pixel counts for the page, sidebar, top bar, right gutter and bottom gutter, plus the
 * colour sampled on the ring's crest in the sidebar.
 */
async function rippleFootprint(page, withRipple, withoutRipple) {
  return page.evaluate(async ([a, b]) => {
    const decode = async (base64) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    };
    const [one, two] = await Promise.all([decode(a), decode(b)]);
    const scale = one.width / window.innerWidth;
    const shell = document.querySelector('.app-shell').getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    const pageBox = document.querySelector('.page-scroll').getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(document.querySelector('.page-scroll')).borderTopLeftRadius);
    const inPage = (x, y) => {
      const inset = 2;
      const left = pageBox.left + inset, right = pageBox.right - inset, top = pageBox.top + inset, bottom = pageBox.bottom - inset;
      if (x < left || x > right || y < top || y > bottom) return false;
      const r = Math.max(0, radius - inset);
      const cx = Math.min(Math.max(x, left + r), right - r), cy = Math.min(Math.max(y, top + r), bottom - r);
      return Math.hypot(x - cx, y - cy) <= r;
    };
    const counts = { page: 0, sidebar: 0, topbar: 0, rightGutter: 0, bottomGutter: 0, total: 0 };
    for (let py = 0; py < one.height; py += 1) {
      for (let px = 0; px < one.width; px += 1) {
        const i = (py * one.width + px) * 4;
        const difference = Math.abs(one.data[i] - two.data[i]) + Math.abs(one.data[i + 1] - two.data[i + 1]) + Math.abs(one.data[i + 2] - two.data[i + 2]);
        if (difference < 24) continue;
        const x = px / scale, y = py / scale;
        counts.total += 1;
        if (inPage(x, y)) counts.page += 1;
        else if (x < sidebar.right) counts.sidebar += 1;
        else if (y < pageBox.top) counts.topbar += 1;
        else if (x > pageBox.right) counts.rightGutter += 1;
        else if (y > pageBox.bottom) counts.bottomGutter += 1;
      }
    }
    return { counts, shell: { width: shell.width, height: shell.height } };
  }, [withRipple.toString('base64'), withoutRipple.toString('base64')]);
}

/** Reads the ripple's measured custom properties and the live boxes they were measured from. */
async function rippleGeometry(page) {
  return page.evaluate(() => {
    const layer = document.querySelector('.shell-ripple');
    const style = layer.style;
    const shell = document.querySelector('.app-shell').getBoundingClientRect();
    const toggle = document.querySelector('[data-ripple-origin]').getBoundingClientRect();
    const pageBox = document.querySelector('.page-scroll').getBoundingClientRect();
    const read = (name) => parseFloat(style.getPropertyValue(name));
    const x = read('--ripple-x'), y = read('--ripple-y');
    return {
      x, y, max: read('--ripple-max'), band: read('--ripple-band'), clipPath: style.clipPath,
      expectedX: toggle.left + toggle.width / 2 - shell.left, expectedY: toggle.top + toggle.height / 2 - shell.top,
      farthest: Math.max(...[[0, 0], [shell.width, 0], [0, shell.height], [shell.width, shell.height]].map(([cx, cy]) => Math.hypot(cx - x, cy - y))),
      page: { left: pageBox.left - shell.left, top: pageBox.top - shell.top, right: pageBox.right - shell.left, bottom: pageBox.bottom - shell.top },
      pointerEvents: getComputedStyle(layer).pointerEvents,
      toggleOnTop: document.elementFromPoint(toggle.left + toggle.width / 2, toggle.top + toggle.height / 2)?.closest('[data-ripple-origin]') !== null,
      navOnTop: (() => { const link = document.querySelector('.nav-link').getBoundingClientRect(); return document.elementFromPoint(link.left + link.width / 2, link.top + link.height / 2)?.closest('.nav-link') !== null; })(),
    };
  });
}

/** Asserts the ripple starts on the toggle, reaches past the farthest corner, cuts out the page and never takes the pointer. */
function assertRippleGeometry(geometry, label) {
  assert.ok(Math.abs(geometry.x - geometry.expectedX) <= 1 && Math.abs(geometry.y - geometry.expectedY) <= 1, `${label}: the ripple must start at the toggle centre.`);
  assert.ok(geometry.max - geometry.band >= geometry.farthest, `${label}: the ring's band must clear the farthest shell corner.`);
  assert.ok(geometry.max - geometry.band < geometry.farthest + 2, `${label}: the ring must be sized from the measured corner, not a fixed scale.`);
  const { left, top, right, bottom } = geometry.page;
  for (const value of [left, top, right, bottom]) assert.ok(geometry.clipPath.includes(String(Math.round(value * 2) / 2)), `${label}: the clip path must follow the page box (${value}).`);
  assert.equal(geometry.pointerEvents, 'none', `${label}: the ripple must not take the pointer.`);
  assert.ok(geometry.toggleOnTop && geometry.navOnTop, `${label}: controls must stay on top of the ripple.`);
}

/**
 * Switches backend through the toggle's own bridge call and checks one direction of the animation:
 * the old page goes inert while it fades, the ripple is sized from live layout, and frames seeked to
 * fixed times paint the outer shell but never the page.
 */
async function verifyRippleDirection(app, page, mode, frames) {
  const target = mode === 'device' ? 'device' : 'cloud';
  await page.mouse.move(400, 300);
  await watchShell(page);
  await page.evaluate(() => { window.shellWatch.freeze = true; });
  await page.evaluate((next) => window.whisperer.settings.setConnectionMode(next), mode);
  await page.waitForSelector('.app-shell[data-transition="leaving"] .page-scroll[inert]', { state: 'attached' });
  await page.waitForSelector(`.app-shell[data-connection="${mode}"] .shell-ripple[data-target="${mode}"]`, { state: 'attached' });
  // The ripple is frozen at its start; let the page finish entering so only the ripple differs between captures.
  await page.waitForSelector('.app-shell[data-transition="idle"]');
  assert.equal(await page.locator('.page-scroll[inert]').count(), 0, 'The new page must be interactive once it has entered.');
  assertRippleGeometry(await rippleGeometry(page), `To ${target}`);
  const results = {};
  // Seeks every ripple animation and waits two frames, so the screenshot shows exactly that time.
  const seek = async (at) => {
    await page.evaluate((time) => { for (const animation of document.querySelector('.shell-ripple').getAnimations({ subtree: true })) animation.currentTime = time; }, at);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  // Let the new backend's queries settle so the page itself stays still between captures.
  await page.waitForTimeout(1500);
  for (const time of frames) {
    // At 0 ms every wave is invisible, so that frame is the same layers with no ring: the baseline.
    await seek(0);
    const withoutRipple = await page.screenshot();
    await seek(time);
    const withRipple = await page.screenshot({ path: path.join(capture, `connection-ripple-to-${target}-${time}ms.png`) });
    results[time] = (await rippleFootprint(page, withRipple, withoutRipple)).counts;
    assert.equal(results[time].page, 0, `To ${target} at ${time} ms: the ripple painted ${results[time].page} page pixels.`);
  }
  debugLog(`Ripple to ${target}:`, results);
  return results;
}

/** Reads, and optionally sets, the hub window's bounds. The hub is the largest window that is not the overlay. */
async function hubWindowBounds(app, next) {
  return app.evaluate(({ BrowserWindow }, bounds) => {
    const area = (window) => window.getBounds().width * window.getBounds().height;
    const hub = BrowserWindow.getAllWindows().filter((window) => !window.webContents.getURL().includes('#/overlay')).sort((a, b) => area(b) - area(a))[0];
    if (bounds) hub.setBounds(bounds);
    return hub.getBounds();
  }, next);
}

/** Lets a frozen ripple finish on its own clock and checks it removes itself. */
async function finishRipple(page) {
  await page.evaluate(() => { for (const animation of document.getAnimations()) animation.play(); });
  await page.waitForSelector('.shell-ripple', { state: 'detached', timeout: 5000 });
}

/**
 * Drives cloud to device and back. Covers measured geometry and seeked frames in both directions,
 * re-measuring on collapse and window resize, a quick flip that lands quietly, and reduced motion.
 */
async function verifyBackendSwitch(app, page) {
  const frames = [250, 600, 1000, 1400, 1750];
  const toDevice = await verifyRippleDirection(app, page, 'device', frames);
  // The wave starts at the toggle in the top bar, crosses the sidebar, and reaches the bottom gutter.
  assert.ok(toDevice[250].topbar > 500, 'To device: the ring must start across the top bar.');
  assert.ok(toDevice[1000].sidebar > 2000, 'To device: the ring must cross the sidebar.');
  const gutters = (results, side) => Object.values(results).reduce((sum, counts) => sum + counts[side], 0);
  assert.ok(gutters(toDevice, 'rightGutter') > 50 && gutters(toDevice, 'bottomGutter') > 50, 'To device: the ring must cross the right and bottom gutters.');
  assert.ok(toDevice[1400].sidebar > 500, 'To device: late in the run the ring must still be travelling toward the farthest (bottom-left) corner.');
  assert.equal(toDevice[1750].total, 0, 'To device: the ring must have faded by the end.');
  // Collapsing the sidebar and resizing the window while it runs re-measure the clip and the reach.
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(400);
  assertRippleGeometry(await rippleGeometry(page), 'Collapsed');
  await page.screenshot({ path: path.join(capture, 'connection-ripple-collapsed.png') });
  const bounds = await hubWindowBounds(app);
  await hubWindowBounds(app, { ...bounds, width: bounds.width + 160, height: bounds.height + 60 });
  await waitFor(async () => (await page.evaluate(() => window.innerWidth)) > bounds.width + 100, 'The hub window did not resize.');
  await page.waitForTimeout(200);
  assertRippleGeometry(await rippleGeometry(page), 'Resized');
  await hubWindowBounds(app, bounds);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await finishRipple(page);
  assert.equal(await page.locator('.app-shell').getAttribute('data-connection'), 'device');

  const toCloud = await verifyRippleDirection(app, page, 'remote', frames);
  assert.ok(toCloud[250].topbar > 500 && toCloud[1000].sidebar > 2000, 'To cloud: the ring must cross the top bar and the sidebar.');
  // The same frozen ring in the light theme, so both palettes are on record.
  const theme = (await page.evaluate(() => window.whisperer.bootstrap())).settings.theme;
  await page.evaluate(() => window.whisperer.settings.update({ theme: 'light' }));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.evaluate(() => { for (const animation of document.querySelector('.shell-ripple').getAnimations({ subtree: true })) animation.currentTime = 600; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(capture, 'connection-ripple-to-cloud-600ms-light.png') });
  await page.evaluate((previous) => window.whisperer.settings.update({ theme: previous }), theme);
  await finishRipple(page);

  // Flipping there and back before the old page has left lands quietly: the newest state wins.
  await watchShell(page);
  await page.evaluate(async () => { await window.whisperer.settings.setConnectionMode('device'); await window.whisperer.settings.setConnectionMode('remote'); });
  await page.waitForSelector('.app-shell[data-transition="idle"][data-connection="remote"]');
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => window.shellWatch.ripple), false, 'A switch that flips back before it lands must not ripple.');

  // Reduced motion switches at once, with no fade and no ripple.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await watchShell(page);
  await page.evaluate(() => window.whisperer.settings.setConnectionMode('device'));
  await page.waitForSelector('.app-shell[data-transition="idle"][data-connection="device"]');
  await page.evaluate(() => window.whisperer.settings.setConnectionMode('remote'));
  await page.waitForSelector('.app-shell[data-transition="idle"][data-connection="remote"]');
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => ({ ripple: window.shellWatch.ripple, leaving: window.shellWatch.leaving })), { ripple: false, leaving: false }, 'Reduced motion must switch without animation.');
  await page.emulateMedia({ reducedMotion: null });
  await page.evaluate(() => window.shellWatch.observer.disconnect());

  // A cold start straight into the hub commits its first state without any switch animation.
  await page.reload();
  await page.locator('.app-shell[data-connection="remote"]').waitFor();
  await watchShell(page);
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(() => ({ ripple: window.shellWatch.ripple, leaving: window.shellWatch.leaving, mounted: document.querySelectorAll('.shell-ripple').length })), { ripple: false, leaving: false, mounted: 0 }, 'Startup must not animate a backend switch.');
  await page.evaluate(() => window.shellWatch.observer.disconnect());
}

/** Hovers each sidebar control with the sidebar collapsed and checks its tooltip shows to the right, whole and inside the window. */
async function verifySidebarTooltips(page) {
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(300);
  const sidebarRight = await page.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().right);
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  for (const name of ['Dictation', 'Notetaker', 'Insights', 'Dictionary', 'Snippets', 'Transforms', 'Scratchpad', 'Settings']) {
    const link = page.locator('.sidebar .nav-link', { hasText: name }).first();
    await link.hover();
    const tooltip = page.locator('.sidebar-tooltip[data-ready="true"]');
    await tooltip.waitFor();
    assert.equal(await tooltip.innerText(), name);
    const box = await tooltip.boundingBox();
    const anchor = await link.boundingBox();
    assert.ok(box.x >= anchor.x + anchor.width && box.x + box.width > sidebarRight && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height, `The ${name} tooltip must sit right of its link, extend past the sidebar and stay inside the window.`);
    await page.waitForTimeout(200);
    if (name === 'Notetaker') await page.screenshot({ path: path.join(capture, 'sidebar-tooltip-collapsed.png') });
  }
  await page.locator('.connection-indicator').hover();
  await page.locator('.sidebar-tooltip[data-ready="true"]').waitFor();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(capture, 'sidebar-tooltip-connection.png') });
  // The brand mark must opt out of the drag region, or a native window drag swallows its hover.
  const mark = page.locator('.brand-row__mark');
  assert.equal(await mark.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'no-drag', 'The brand mark must be no-drag so hover reaches it.');
  assert.equal(await page.locator('.brand-row').evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'drag', 'The rest of the brand row must stay draggable.');
  await mark.hover();
  const brandTip = page.locator('.sidebar-tooltip[data-ready="true"]');
  await brandTip.waitFor();
  assert.equal(await brandTip.innerText(), 'Whisperer');
  assert.equal(await mark.getAttribute('aria-describedby'), await brandTip.getAttribute('id'), 'The brand mark must be described by its tooltip.');
  await page.mouse.move(600, 400);
  await brandTip.waitFor({ state: 'detached' });
  // Clicking the collapse control runs its handler and dismisses the now stale tooltip.
  const toggle = page.getByRole('button', { name: 'Expand sidebar' });
  await toggle.hover();
  await page.locator('.sidebar-tooltip[data-ready="true"]').waitFor();
  assert.equal(await page.locator('.sidebar-tooltip').innerText(), 'Expand sidebar');
  await toggle.click();
  await page.locator('.sidebar-tooltip').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.app-shell--collapsed').count(), 0, 'Clicking the toggle must still expand the sidebar.');
  await page.mouse.move(600, 400);
  await page.waitForTimeout(300);
}

try {
  const executablePath = process.platform === 'darwin'
    ? path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
  desktop = await _electron.launch({
    executablePath,
    args: [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []), '--use-fake-device-for-media-stream', root],
    env: { ...process.env, WHISPERER_DESKTOP_DATA_DIR: path.join(temporary, 'desktop'), WHISPERER_RELEASE_FEED_URL: fixture.url },
    timeout: 45000,
  });
  // The fixture replaces the identity provider only; never open a real browser or production URL.
  await desktop.evaluate(({ shell }) => { globalThis.openedExternal = []; shell.openExternal = async (url) => { globalThis.openedExternal.push(url); }; });
  const hub = await desktop.firstWindow();
  hub.on('pageerror', (error) => errors.push(error.message));
  hub.on('console', (message) => { if (['error', 'warning'].includes(message.type())) console.error(`renderer ${message.type()}: ${message.text().slice(0, 400)}`); });
  await hub.waitForFunction(() => Boolean(window.whisperer));
  await passPermissionPreflight(hub, (page) => captureThemes(page, 'ui-permissions-check'));
  await hub.getByRole('button', { name: /sign in.*browser/i }).waitFor({ timeout: 20000 });
  await captureThemes(hub, 'ui-sign-in');
  assert.equal(await hub.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await hub.evaluate(() => 'ipcRenderer' in window.whisperer), false);
  const initial = await hub.evaluate(() => window.whisperer.bootstrap());
  assert.equal(initial.settings.authenticated, false);
  assert.equal(initial.settings.apiHost, null);
  await hub.getByLabel(/server URL/i).fill(fixture.url);
  await hub.getByRole('button', { name: /sign in.*browser/i }).click();
  await waitFor(async () => Boolean((await hub.evaluate(() => window.whisperer.bootstrap())).user));
  const signedIn = await hub.evaluate(() => window.whisperer.bootstrap());
  assert.equal(signedIn.settings.authenticated, true);
  assert.equal('accessToken' in signedIn, false);
  await hub.evaluate(() => window.whisperer.settings.update({ autoPaste: false }));
  await hub.getByRole('heading', { name: /Give Whisperer permissions on your computer|Thanks for trusting us, we value your privacy/i }).waitFor();
  await captureThemes(hub, 'ui-onboarding-permissions');
  await resolveOnboardingPermission(hub, 'microphone', 'Allow microphone');
  await resolveOnboardingPermission(hub, 'accessibility', 'Allow input access');
  await hub.getByRole('heading', { name: /Give Whisperer permissions on your computer|Thanks for trusting us, we value your privacy/i }).waitFor();
  const permissionsContinue = hub.getByRole('button', { name: 'Continue', exact: true });
  if (!await permissionsContinue.isEnabled()) {
    const recheckPermissions = hub.getByRole('button', { name: 'Check permissions again', exact: true });
    try {
      await recheckPermissions.click({ timeout: 1000 });
    } catch (error) {
      // A successful permission latch removes this button; only propagate a real unresolved-permission failure.
      if (!await permissionsContinue.isEnabled()) throw error;
    }
  }
  await waitFor(() => permissionsContinue.isEnabled(), 'Device setup cannot continue because the platform did not resolve microphone permission.');
  await permissionsContinue.click();
  await hub.getByRole('heading', { name: 'Test your microphone', exact: true }).waitFor();
  const historyBeforeMicrophoneTest = (await hub.evaluate(() => window.whisperer.history.list())).length;
  await hub.getByRole('button', { name: 'Start microphone test', exact: true }).click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).recording.status === 'recording', 'Microphone test did not reach real PCM capture.');
  await hub.getByRole('button', { name: 'Yes', exact: true }).click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).recording.status === 'idle', 'Confirming microphone test did not stop capture.');
  assert.equal((await hub.evaluate(() => window.whisperer.history.list())).length, historyBeforeMicrophoneTest);
  assert.equal(fixture.metrics.size, 0);
  await hub.getByRole('heading', { name: /Set the language(?:\(s\)|s)? you speak/i }).waitFor();
  await hub.getByRole('combobox', { name: /language/i }).selectOption('en');
  await hub.getByRole('button', { name: 'Continue', exact: true }).click();
  await hub.getByRole('heading', { name: 'Press the keyboard shortcut to test it out', exact: true }).waitFor();
  const shortcutTest = hub.locator('.device-shortcut-test');
  await shortcutTest.waitFor();
  const onboardingState = await hub.evaluate(() => window.whisperer.bootstrap());
  const bindings = onboardingState.settings.shortcutBindings;
  const selectedShortcut = onboardingState.capabilities.holdToTalk.supported && bindings?.holdToTalk?.[0]
    ? bindings.holdToTalk
    : bindings?.toggleRecording?.[0] ?? onboardingState.settings.shortcut;
  await dispatchSelectedShortcut(shortcutTest, selectedShortcut, async () => {
    await hub.locator('.device-shortcut-test .shortcut-chip.is-pressed').first().waitFor();
  });
  const shortcutConfirmed = hub.getByRole('button', { name: 'Yes', exact: true });
  await shortcutConfirmed.waitFor();
  await waitFor(() => shortcutConfirmed.isEnabled(), 'Selected shortcut did not activate the onboarding key-highlighter.');
  await shortcutConfirmed.click();
  await hub.getByRole('heading', { name: 'Press the keyboard shortcut to use Whisperer', exact: true }).waitFor();
  await hub.getByRole('button', { name: 'Start tutorial recording' }).click();
  await waitFor(async () => {
    const text = await hub.locator('[aria-label="Dictation recorder"] small').first().innerText();
    return Number(text.match(/(\d+) KiB/)?.[1] ?? 0) > 1;
  });
  await hub.getByRole('button', { name: 'Finish tutorial recording' }).click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.history.list())).length === 1);
  await watchShell(hub);
  await hub.getByRole('button', { name: 'Finish setup' }).click();
  await hub.getByRole('link', { name: 'Dictation', exact: true }).waitFor();
  assert.equal((await hub.evaluate(() => window.whisperer.bootstrap())).recording.status, 'idle');
  // Signed in to the fixture with no on-device runtime: the top-bar switch rests on cloud, disabled, and says what to set up.
  const toggle = hub.getByRole('switch');
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  assert.equal(await toggle.getAttribute('aria-disabled'), 'true');
  assert.match(await toggle.getAttribute('aria-label'), /set up on-device inference/i);
  await toggle.hover();
  await hub.screenshot({ path: path.join(capture, 'connection-toggle-hover.png') });
  assert.equal(await hub.evaluate(() => window.shellWatch.ripple || window.shellWatch.leaving), false, 'Opening the hub must not play the backend-switch animation.');
  await verifyBackendSwitch(desktop, hub);
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-checked'), 'false');
  await verifySidebarTooltips(hub);
  await verifyUpdateNotice(desktop, hub);
  await verifyMcpSettings(desktop, hub, fixture.url);
  const note = await hub.evaluate(() => window.whisperer.notes.save({ title: 'Acceptance note', content: 'A synthetic desktop note. No personal content.' }));
  assert.equal(note.title, 'Acceptance note');
  const summarized = await hub.evaluate((id) => window.whisperer.notes.summarize(id), note.id);
  assert.ok(summarized.summary?.includes('Synthetic'));
  const word = await hub.evaluate(() => window.whisperer.dictionary.save({ phrase: 'desktop test', replacement: 'Desktop test' }));
  assert.equal(word.phrase, 'desktop test');
  const snippet = await hub.evaluate(() => window.whisperer.snippets.save({ shortcut: 'test', text: 'Synthetic snippet' }));
  assert.equal(snippet.text, 'Synthetic snippet');
  await hub.evaluate(() => { location.hash = '#/notes'; });
  await hub.getByText('Acceptance note', { exact: true }).first().waitFor({ timeout: 10000 });
  await hub.screenshot({ path: path.join(capture, 'desktop-notes.png') });
  // Dark mode must keep every content surface readable, and the Scratchpad shortcut must render as key chips.
  await hub.getByRole('button', { name: 'Change Scratchpad shortcut' }).first().waitFor();
  await captureThemes(hub, 'ui-scratchpad');
  for (const page of ['dictionary', 'snippets']) {
    await hub.evaluate((route) => { location.hash = `#/${route}`; }, page);
    await hub.waitForTimeout(300);
    await captureThemes(hub, `ui-${page}`);
  }
  await hub.evaluate(() => { location.hash = '#/insights'; });
  await verifyInsightsPage(hub);
  await hub.evaluate(() => { location.hash = '#/settings'; });
  await hub.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  const shortcutsRow = hub.locator('.settings-row').filter({ has: hub.getByText('Shortcuts', { exact: true }) });
  await shortcutsRow.getByRole('button', { name: 'Change', exact: true }).click();
  await hub.getByRole('dialog', { name: 'Shortcuts', exact: true }).waitFor();
  await verifyShortcutRecorder(hub);
  await hub.screenshot({ path: path.join(capture, 'ui-settings-shortcuts.png') });
  await hub.evaluate(() => { location.hash = '#/home'; });
  await verifyOverlay(desktop, hub);
  const history = await hub.evaluate(() => window.whisperer.history.list());
  assert.equal(history.length, 2);
  assert.equal(history[0].text, 'Synthetic desktop dictation.');
  assert.equal(history[0].rawText, 'synthetic raw dictation');
  assert.equal(fixture.metrics.size, 2);
  assert.ok([...fixture.metrics.values()].every((metric) => !('text' in metric) && !('rawText' in metric) && metric.dictionaryReplacements === 1));
  assert.equal((await hub.evaluate(() => window.whisperer.metrics.get())).dictationCount, 2);
  const proposal = await hub.evaluate(() => window.whisperer.transformations.preview({ text: 'Synthetic source', kind: 'shorten' }));
  assert.equal(proposal.text, 'Proposed: Synthetic source');
  assert.equal((await hub.evaluate(() => window.whisperer.history.list()))[0].text, 'Synthetic desktop dictation.');
  await hub.evaluate(() => { location.hash = '#/history'; });
  await hub.getByText('Synthetic desktop dictation.', { exact: true }).first().waitFor();
  await verifyLandingHistory(hub);
  await hub.screenshot({ path: path.join(capture, 'desktop-history.png') });
  await hub.getByRole('region', { name: 'History' }).screenshot({ path: path.join(capture, 'dictation-history-section.png') });
  // The search is an icon that opens into a field. Escape closes it and clears the filter.
  const rows = hub.locator('.dictation-history li');
  const rowCount = await rows.count();
  await hub.getByRole('button', { name: 'Search dictations' }).click();
  const searchField = hub.getByRole('searchbox', { name: 'Search dictations' });
  await searchField.fill('no such dictation');
  await hub.getByText('No matching dictations').waitFor();
  await searchField.screenshot({ path: path.join(capture, 'dictation-search-open.png') });
  await searchField.press('Escape');
  await waitFor(async () => (await rows.count()) === rowCount);
  await hub.getByRole('button', { name: 'Search dictations' }).waitFor();
  await verifyTransformsPage(hub);
  await hub.evaluate(() => { location.hash = '#/settings'; });
  await hub.getByText('Settings', { exact: true }).first().waitFor();
  await hub.screenshot({ path: path.join(capture, 'desktop-settings.png') });
  // The scoped audio endpoint must be inaccessible before sign-in and available only for owned meetings.
  await hub.evaluate(() => { location.hash = '#/meetings'; });
  await hub.getByRole('heading', { name: 'Notetaker', exact: true }).waitFor();
  const captureState = await hub.evaluate(() => window.whisperer.meetings.capture.start({ title: 'Synthetic meeting' }));
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).meetingCapture?.status === 'recording');
  await assert.rejects(() => hub.evaluate(() => window.whisperer.recording.start()), /meeting recording/i);
  await hub.evaluate(() => window.whisperer.meetings.capture.stop());
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).meetingCapture === null);
  await waitFor(async () => (await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id))?.summaryStatus === 'complete');
  const meeting = await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id);
  assert.equal(meeting?.hasAudio, true);
  assert.ok(meeting.durationMs > 0);
  assert.equal(meeting.transcript, 'Synthetic meeting transcript.');
  assert.equal(meeting.summary, 'Synthetic meeting summary.');
  assert.equal(fixture.meetings.get(captureState.id)?.summary, 'Synthetic meeting summary.');
  const edited = await hub.evaluate((item) => window.whisperer.meetings.saveTranscript({ id: item.id, text: 'Synthetic edited transcript.', revision: item.transcriptRevision }), meeting);
  assert.equal(edited.transcript, 'Synthetic edited transcript.');
  await waitFor(() => fixture.meetings.get(captureState.id)?.transcript === 'Synthetic edited transcript.');
  const regenerated = await hub.evaluate((id) => window.whisperer.meetings.regenerateSummary(id), captureState.id);
  assert.equal(regenerated.summary, 'Summary: Synthetic edited transcript.');
  await hub.evaluate((id) => window.whisperer.meetings.resume(id), captureState.id);
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).meetingCapture?.status === 'recording');
  await hub.evaluate(() => window.whisperer.meetings.capture.stop());
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).meetingCapture === null);
  await waitFor(() => (fixture.meetings.get(captureState.id)?.durationMs ?? 0) > meeting.durationMs);
  await waitFor(async () => (await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id))?.summaryStatus === 'complete', 'Resumed meeting did not finish before its review content was seeded.');
  const resumed = await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id);
  assert.equal(resumed.transcript, 'Synthetic edited transcript.');
  const richTranscript = [
    'We agreed to keep the next release focused on reliable meeting review rather than adding unsupported collaboration controls.',
    'Priya will validate the revised Notetaker workspace with synthetic recordings on Linux before the next planning review.',
    'The group also noted that summary edits must remain reviewable when a newer transcript arrives from the server.',
  ].join('\n\n');
  const richlyEdited = await hub.evaluate((item) => window.whisperer.meetings.saveTranscript({ id: item.id, text: item.text, revision: item.revision }), { id: captureState.id, text: richTranscript, revision: resumed.transcriptRevision });
  assert.equal(richlyEdited.transcript, richTranscript);
  const richSummary = 'The meeting stayed focused on reliable review rather than adding unsupported collaboration controls.\n\n## Decisions\n\n- Keep the meeting workspace focused on transcript and summary review.\n- Validate the new controls with fixture audio before release.\n\n## Follow-up\n\nPriya will document the review findings for the next planning session.';
  const richlySummarized = await hub.evaluate((item) => window.whisperer.meetings.saveSummary({ id: item.id, text: item.text, revision: item.revision }), { id: captureState.id, text: richSummary, revision: richlyEdited.summaryRevision });
  assert.equal(richlySummarized.summary, richSummary);
  const playback = await hub.evaluate(async (id) => {
    const response = await fetch(`whisperer://local/meeting-audio/${id}`, { headers: { Range: 'bytes=0-31' } });
    return { status: response.status, size: (await response.arrayBuffer()).byteLength };
  }, captureState.id);
  assert.deepEqual(playback, { status: 206, size: 32 });
  const renamed = await hub.evaluate((item) => window.whisperer.meetings.save({ id: item.id, title: 'Renamed meeting', startedAt: item.startedAt, endedAt: item.endedAt, durationMs: item.durationMs }), richlySummarized);
  assert.equal(renamed.title, 'Renamed meeting');
  assert.equal(renamed.hasAudio, true);
  assert.equal(renamed.durationMs, resumed.durationMs);
  assert.equal(fixture.meetings.get(captureState.id)?.title, 'Renamed meeting');
  // Home preview is selection only: a row exposes its summary beside the list and opens only through its clear action.
  await hub.getByRole('heading', { name: 'Past notes', exact: true }).waitFor();
  // The synthetic bridge calls above bypass renderer invalidations, so take the same explicit sync path a person can use.
  await hub.getByRole('button', { name: 'More Notetaker actions', exact: true }).click();
  await hub.getByRole('menuitem', { name: 'Sync notes', exact: true }).click();
  const meetingRow = hub.locator('.ui-notetaker-row', { hasText: 'Renamed meeting' });
  await meetingRow.waitFor();
  const homeProportions = await hub.evaluate(() => {
    const open = document.querySelector('.ui-notetaker-row__open');
    const listHeader = document.querySelector('.ui-notetaker-list__header');
    const overviewHeader = document.querySelector('.ui-notetaker-overview header');
    if (!open || !listHeader || !overviewHeader) throw new Error('Notetaker home proportions are unavailable.');
    const values = (node) => {
      const style = getComputedStyle(node);
      return { bottom: parseFloat(style.paddingBottom), top: parseFloat(style.paddingTop) };
    };
    const openStyle = getComputedStyle(open);
    return {
      fontSize: parseFloat(openStyle.fontSize),
      height: open.getBoundingClientRect().height,
      list: values(listHeader),
      overview: values(overviewHeader),
    };
  });
  assert.equal(homeProportions.fontSize, 12, 'Open note must keep its compact 12px rendered font.');
  assert.ok(homeProportions.height >= 24, 'Open note must retain a 24px minimum hit target.');
  assert.ok(Math.abs(homeProportions.list.top - homeProportions.list.bottom) <= 1, 'Past notes and search must have balanced header padding.');
  assert.ok(Math.abs(homeProportions.overview.top - homeProportions.overview.bottom) <= 1, 'Overview heading must have balanced header padding.');
  const meetingSearch = hub.locator('.ui-notetaker-search input');
  await meetingSearch.fill('no matching meeting');
  await hub.getByText('No matching notes', { exact: true }).waitFor();
  await hub.getByRole('complementary', { name: 'Selected note overview' }).getByRole('heading', { name: 'Select a note', exact: true }).waitFor();
  await meetingSearch.fill('');
  await meetingRow.waitFor();
  await meetingRow.locator('.ui-notetaker-row__select').click();
  await hub.getByRole('complementary', { name: 'Selected note overview' }).getByText('Renamed meeting', { exact: true }).waitFor();
  await captureThemes(hub, 'ui-notetaker-home');
  await meetingRow.getByRole('button', { name: 'Open note', exact: true }).click();
  await hub.getByRole('main', { name: 'Meeting workspace' }).waitFor();
  await hub.getByRole('button', { name: 'Meeting actions', exact: true }).click();
  await hub.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const renameDialog = hub.getByRole('dialog', { name: 'Rename note', exact: true });
  await renameDialog.getByRole('textbox', { name: 'Meeting title', exact: true }).fill('Workspace renamed meeting');
  await renameDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await hub.getByRole('heading', { name: 'Workspace renamed meeting', exact: true }).waitFor();
  const transcriptTab = hub.getByRole('tab', { name: 'Transcript', exact: true });
  const summaryTab = hub.getByRole('tab', { name: /^Summary/ });
  assert.equal(await transcriptTab.getAttribute('aria-selected'), 'true');
  await captureThemes(hub, 'ui-notetaker-transcript');
  await transcriptTab.press('ArrowRight');
  assert.equal(await summaryTab.getAttribute('aria-selected'), 'true', 'Right arrow must select the summary tab.');
  await captureThemes(hub, 'ui-notetaker-summary');
  await summaryTab.press('ArrowLeft');
  assert.equal(await transcriptTab.getAttribute('aria-selected'), 'true', 'Left arrow must return to the transcript tab.');
  await hub.screenshot({ path: path.join(capture, 'desktop-notetaker-detail.png') });
  const questionBox = hub.getByRole('textbox', { name: 'Ask about this meeting', exact: true });
  await questionBox.fill('Wait for the answer');
  await questionBox.press('Enter');
  await captureThemes(hub, 'ui-notetaker-question-pending');
  await hub.getByText('Saved answer: Wait for the answer', { exact: true }).waitFor();
  await captureThemes(hub, 'ui-notetaker-question-success');
  await questionBox.fill('Make the request fail');
  await questionBox.press('Enter');
  await hub.getByRole('alert').filter({ hasText: 'configured language model is unavailable' }).waitFor();
  await captureThemes(hub, 'ui-notetaker-question-error');
  await hub.getByRole('button', { name: 'Dismiss answer', exact: true }).click();
  await hub.getByRole('button', { name: 'Edit', exact: true }).click();
  const transcriptEditor = hub.getByRole('textbox', { name: 'Transcript text', exact: true });
  await transcriptEditor.fill('Synthetic UI-edited transcript.');
  // Dismissing the discard confirmation keeps the workspace and its draft intact.
  hub.once('dialog', (dialog) => dialog.dismiss());
  await hub.getByRole('button', { name: 'Meeting actions', exact: true }).click();
  await hub.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await hub.getByRole('main', { name: 'Meeting workspace' }).waitFor();
  assert.equal(await transcriptEditor.inputValue(), 'Synthetic UI-edited transcript.');
  await hub.getByRole('button', { name: 'Save changes', exact: true }).click();
  await waitFor(async () => (await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id))?.transcript === 'Synthetic UI-edited transcript.', 'Explicit workspace transcript save did not persist.');
  await questionBox.fill('What was saved?');
  await questionBox.press('Enter');
  await hub.getByText('Saved answer: What was saved?', { exact: true }).waitFor();
  await hub.getByRole('button', { name: 'Dismiss answer', exact: true }).click();
  const durationBeforeWorkspaceResume = (await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id)).durationMs;
  await hub.getByRole('button', { name: 'Resume', exact: true }).click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).meetingCapture?.status === 'recording', 'Workspace resume did not start capture.');
  await hub.getByRole('button', { name: 'Stop', exact: true }).click();
  await waitFor(async () => (await hub.evaluate(() => window.whisperer.bootstrap())).meetingCapture === null, 'Workspace stop did not finish capture.');
  await waitFor(async () => (await hub.evaluate((id) => window.whisperer.meetings.get(id), captureState.id))?.durationMs > durationBeforeWorkspaceResume, 'Resumed workspace capture did not refresh the meeting duration.');
  await hub.getByText('Synthetic UI-edited transcript.', { exact: true }).waitFor();
  await hub.getByRole('button', { name: 'Back to past notes', exact: true }).click();
  await hub.getByRole('heading', { name: 'Past notes', exact: true }).waitFor();
  await hub.screenshot({ path: path.join(capture, 'desktop-notetaker.png') });
  await hub.evaluate((id) => window.whisperer.notes.open(id), note.id);
  const scratchpad = await waitForWindow(desktop, /scratchpad/);
  await scratchpad.screenshot({ path: path.join(capture, 'desktop-scratchpad.png') });
  await scratchpad.getByRole('button', { name: 'Close scratchpad', exact: true }).click();
  await hub.evaluate((id) => window.whisperer.meetings.delete(id), captureState.id);
  assert.equal(fixture.meetings.has(captureState.id), false);
  await hub.evaluate((id) => window.whisperer.notes.delete(id), note.id);
  await hub.evaluate((id) => window.whisperer.dictionary.delete(id), word.id);
  await hub.evaluate((id) => window.whisperer.snippets.delete(id), snippet.id);
  await hub.evaluate(() => window.whisperer.auth.signOut());
  const loggedOut = await hub.evaluate(() => window.whisperer.bootstrap());
  assert.equal(loggedOut.settings.apiHost, null);
  assert.equal(loggedOut.settings.authenticated, false);
  assert.deepEqual(await hub.evaluate(() => window.whisperer.history.list()).catch(() => []), []);
  assert.equal(fixture.requests.some(({ path: requestPath }) => requestPath.startsWith('/v1/transcripts')), false);
  assert.deepEqual(errors, []);
  console.log('Desktop acceptance passed: themed browser sign-in, five-step device setup, DOM shortcut capture/conflicts, fake-microphone overlay cancellation/completion/geometry, notes/summary, dictionary, snippets, metrics, transformations, meetings, history, settings, and sign-out.');
  console.log(`Screenshots: ${capture}`);
} catch (error) {
  if (desktop) {
    const windows = desktop.windows();
    const state = await windows[0]?.evaluate(() => window.whisperer.bootstrap()).catch(() => null);
    console.error('Recording state at failure:', JSON.stringify(state?.recording));
    console.error('Recorder text:', await windows[0]?.locator('[aria-label="Dictation recorder"]').first().innerText().catch(() => 'n/a'));
    if (windows[0]) await windows[0].screenshot({ path: path.join(capture, 'desktop-failure.png') }).catch(() => {});
  }
  console.error(error);
  console.error('Renderer errors:', errors);
  process.exitCode = 1;
} finally {
  if (desktop) await desktop.close();
  await fixture.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
