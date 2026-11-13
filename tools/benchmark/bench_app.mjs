// Drives the packaged Whisperer desktop app for the benchmarks, through Chromium CDP and the app's own
// window.whisperer bridge, with a temporary profile (WHISPERER_DESKTOP_DATA_DIR). Windows only.
//
// Usage: node bench_app.mjs <mode> --exe <whisperer.exe> --profile <dir> --out <dir> --pw <playwright-core index.mjs> [options]
//   setup      --model <id>                    Local mode, runtime install, model download; records timings and sizes
//   coldstart  --runs 3                        launch -> main window ready, launch -> speech ready
//   dictation  --clips <dir> [--count 20]      one dictation per clip through the real flow into a separate window
//   idle       --minutes 5                     memory of the app and its local server after idling
//   privacy    --clips <dir> --stub <url> --minutes 10   Local mode session (dictations + one meeting with summary)
//                                              while every outbound TCP connection of the app's process tree is logged
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [mode, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(pathToFileURL(opt.pw).href);
const acOnline = () => { try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[bool]((Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus).PowerOnline -contains $true)'], { encoding: 'utf8' }).trim() === 'True'; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
fs.mkdirSync(opt.out, { recursive: true });
const logFile = path.join(opt.out, `${mode}.log`);
const log = (line) => { const l = `${new Date().toISOString()} ${line}`; console.log(l); fs.appendFileSync(logFile, `${l}\n`); };
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const psFile = (file, args) => spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, file), ...args.map(String)], { stdio: 'ignore' });
const dirBytes = (dir) => { let total = 0; if (!fs.existsSync(dir)) return 0; for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) { if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size; } return total; };

async function waitFor(fn, ms, label, interval = 200) {
  const end = now() + ms; let last;
  while (now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(interval); }
  throw new Error(`timed out: ${label} (last: ${JSON.stringify(last)?.slice(0, 300)})`);
}

/** Launches the app on the profile; resolves when the hub exposes the bridge and bootstrap answers. */
async function launch(extraArgs = []) {
  const port = await new Promise((resolve) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const t0 = now();
  const child = spawn(opt.exe, [`--remote-debugging-port=${port}`, ...extraArgs], { env: { ...process.env, WHISPERER_DESKTOP_DATA_DIR: opt.profile }, stdio: 'ignore' });
  const browser = await waitFor(async () => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 }).catch(() => null), 120_000, 'CDP', 100);
  const context = browser.contexts()[0];
  const hub = await waitFor(async () => context.pages().find((p) => p.url().startsWith('whisperer://') && !p.url().includes('overlay')), 60_000, 'hub', 50);
  await hub.waitForFunction(() => Boolean(window.whisperer), null, { timeout: 60_000, polling: 50 });
  const bridge = (fn, arg) => hub.evaluate(fn, arg);
  await bridge(() => window.whisperer.bootstrap());
  const windowReadyMs = now() - t0;
  return { child, browser, context, hub, bridge, t0, windowReadyMs };
}

async function close(app) {
  await app?.browser?.close().catch(() => {});
  try { execFileSync('taskkill', ['/PID', String(app.child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(3000);
}

const serverState = async (app) => (await app.bridge(() => window.whisperer.bootstrap())).settings.localServer;
async function speechReady(app, ms = 10 * 60_000) {
  return waitFor(async () => { const s = await serverState(app); if (s.state === 'failed' || s.speech?.status === 'failed') throw new Error(JSON.stringify(s).slice(0, 300)); return s.state === 'ready' && s.speech?.status === 'ready' && s; }, ms, 'speech ready', 100);
}

async function setup() {
  const result = { model: opt.model };
  const app = await launch();
  try {
    await app.hub.getByRole('button', { name: /Continue without signing in/i }).click({ timeout: 60_000 });
    await waitFor(async () => (await app.bridge(() => window.whisperer.bootstrap())).settings.connectionMode === 'device', 30_000, 'device mode');
    await app.bridge(() => window.whisperer.settings.update({ onboardingCompleted: true, autoPaste: true, polish: false }));
    await app.hub.reload(); await app.hub.waitForFunction(() => Boolean(window.whisperer));
    let t = now();
    await app.bridge(() => window.whisperer.localServer.setup());
    await waitFor(async () => { const s = await serverState(app); if (s.state === 'failed') throw new Error(JSON.stringify(s)); return s.state === 'ready'; }, 30 * 60_000, 'runtime ready', 500);
    result.runtimeSetupSeconds = (now() - t) / 1000;
    await app.bridge((m) => window.whisperer.inference.update({ speech: { provider: 'onnx', model: m }, llm: { provider: 'off' } }), opt.model);
    await sleep(5000);
    await waitFor(async () => (await serverState(app)).state === 'ready', 5 * 60_000, 'restart');
    t = now();
    await app.bridge((m) => window.whisperer.inference.downloadModel(m), opt.model);
    await speechReady(app, 60 * 60_000);
    result.modelDownloadAndLoadSeconds = (now() - t) / 1000;
  } finally { await close(app); }
  result.runtimeBytesOnDisk = dirBytes(path.join(opt.profile, 'runtime'));
  result.modelBytesOnDisk = dirBytes(path.join(opt.profile, 'device', 'models'));
  fs.writeFileSync(path.join(opt.out, `setup-${opt.model.split('/').pop()}.json`), JSON.stringify(result, null, 2));
  log(`setup ${JSON.stringify(result)}`);
}

async function coldstart() {
  const runs = [];
  for (let run = 1; run <= Number(opt.runs ?? 3); run += 1) {
    const app = await launch();
    try {
      // The server starts with the app in Local mode; record when it is first seen starting and when speech is ready.
      let serverSeen = null;
      await waitFor(async () => { const s = await serverState(app); if (!serverSeen && ['starting', 'ready'].includes(s.state)) serverSeen = now(); return s.state === 'ready' && s.speech?.status === 'ready'; }, 10 * 60_000, 'speech ready', 100);
      const speech = now();
      runs.push({ run, launchToWindowReadyMs: app.windowReadyMs, launchToSpeechReadyMs: speech - app.t0, serverFirstSeenToSpeechReadyMs: speech - serverSeen });
      log(`coldstart ${JSON.stringify(runs.at(-1))}`);
    } finally { await close(app); }
    await sleep(10_000);
  }
  fs.writeFileSync(path.join(opt.out, 'coldstart.json'), JSON.stringify(runs, null, 2));
}

/** Opens the WinForms target and waits until it holds the foreground. */
async function openTarget(initial = '') {
  const textFile = path.join(opt.out, 'target-text.txt'); const hwndFile = path.join(opt.out, 'target-hwnd.txt');
  fs.rmSync(textFile, { force: true }); fs.rmSync(hwndFile, { force: true });
  const proc = psFile('target-win.ps1', [textFile, hwndFile, initial]);
  const state = () => { try { const [hwnd, , fg] = fs.readFileSync(hwndFile, 'utf8').trim().split(' '); return { focused: hwnd === fg, hwnd, fg }; } catch { return null; } };
  const text = () => { try { return fs.readFileSync(textFile, 'utf8'); } catch { return ''; } };
  await waitFor(async () => state()?.focused, 20_000, 'target focused', 100).catch(() => null);
  return { state, text, close: () => { try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } } };
}

async function dictation() {
  const refs = JSON.parse(fs.readFileSync(path.join(opt.clips, 'refs.json'), 'utf8'));
  const lead = refs.lead_silence_s;
  const results = [];
  // Dictation types into a real window, so it needs an unlocked desktop with a foreground window.
  const desktop = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow();'; $fg = [W.U]::GetForegroundWindow(); $locked = [bool](Get-Process LogonUI -ErrorAction SilentlyContinue); \"$fg $locked\""], { encoding: 'utf8' }).trim().split(' ');
  if (desktop[0] === '0' || desktop[1] === 'True') throw new Error(`desktop not available for dictation (foreground ${desktop[0]}, locked ${desktop[1]})`);
  log(`desktop available: foreground window ${desktop[0]}, locked ${desktop[1]}`);
  let focusFailuresInARow = 0;
  for (const clip of refs.clips.slice(0, Number(opt.count ?? 20))) {
    if (focusFailuresInARow >= 3) { log('PAUSED: focus lost on 3 clips in a row; remaining clips not run'); results.push({ paused: 'focus lost on 3 clips in a row' }); break; }
    let attempt = 0; let done = false;
    while (!done && attempt < 3) {
      attempt += 1;
      const fake = path.join(opt.clips, `fake-${String(clip.clip).padStart(2, '0')}.wav`);
      const app = await launch(['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fake}`]);
      let target;
      try {
        await speechReady(app);
        // Timestamp the capture start inside the hub, at the moment main reports the take as recording.
        await app.bridge(() => { window.__rec = null; window.whisperer.events.onState((s) => { if (s.recording.status === 'recording' && !window.__rec) window.__rec = Date.now(); }); });
        target = await openTarget('');
        if (!target.state()?.focused) throw new Error(`target never held the foreground ${JSON.stringify(target.state())}`);
        if (target.text().trim()) throw new Error(`target was not empty before recording: ${JSON.stringify(target.text().slice(0, 40))}`);
        await app.bridge(() => window.whisperer.recording.start());
        const capturing = await waitFor(async () => app.bridge(() => window.__rec), 30_000, 'capturing', 10);
        // Release 0.3 s after the clip's speech ends (0.5 s lead silence + clip length), as a user would.
        const releaseAt = capturing + (lead + clip.seconds + 0.3) * 1000;
        await sleep(Math.max(0, releaseAt - now()));
        const stoppedAt = now();
        await app.bridge(() => window.whisperer.recording.stop());
        // The paste lands all at once; require the dictation itself, not a stray keystroke.
        const text = await waitFor(async () => { const t = target.text().trim(); return t.length > 20 && t; }, 120_000, 'text in target', 5);
        const appearedAt = now();
        await sleep(400);
        const focusedAtEnd = target.state()?.focused;
        if (!focusedAtEnd) throw new Error('the target lost the foreground during the take; retrying');
        results.push({ clip: clip.clip, id: clip.id, seconds: clip.seconds, attempt, latencyMs: appearedAt - stoppedAt, text: target.text().trim() || text, reference: clip.reference, focusedAtEnd });
        log(`clip ${clip.clip} latency ${appearedAt - stoppedAt} ms :: ${text.slice(0, 80)}`);
        done = true; focusFailuresInARow = 0;
      } catch (error) {
        log(`clip ${clip.clip} attempt ${attempt} FAILED: ${error.message.split('\n')[0]}`);
        results.push({ clip: clip.clip, attempt, failed: error.message.split('\n')[0] });
        // A focus failure means the desktop is unavailable: count the clip and do not burn retries.
        if (/foreground/.test(error.message)) { focusFailuresInARow += 1; done = true; }
      } finally { target?.close(); await close(app); }
    }
  }
  fs.writeFileSync(path.join(opt.out, 'dictation.json'), JSON.stringify(results, null, 2));
}

async function idle() {
  const app = await launch();
  const stop = path.join(opt.out, 'idle.stop'); fs.rmSync(stop, { force: true });
  try {
    await speechReady(app);
    log('speech ready; idling');
    await sleep(Number(opt.minutes ?? 5) * 60_000);
    const csv = path.join(opt.out, 'idle-mem.csv');
    const sampler = psFile('memsample.ps1', [app.child.pid, csv, stop, 1000]);
    await sleep(30_000);
    fs.writeFileSync(stop, 'stop'); await sleep(3000); sampler.kill();
    log(`idle memory samples in ${csv}`);
  } finally { await close(app); }
}

async function privacy() {
  const refs = JSON.parse(fs.readFileSync(path.join(opt.clips, 'refs.json'), 'utf8'));
  const fake = path.join(opt.clips, 'fake-01.wav');
  const app = await launch(['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fake}`]);
  const egressFile = path.join(opt.out, 'egress.txt'); const stop = path.join(opt.out, 'egress.stop');
  fs.rmSync(egressFile, { force: true }); fs.rmSync(`${egressFile}.dns`, { force: true }); fs.rmSync(stop, { force: true });
  const egress = psFile('egress-win.ps1', [app.child.pid, egressFile, stop]);
  const started = now(); const events = [];
  try {
    await speechReady(app);
    await app.bridge((url) => window.whisperer.inference.update({ llm: { provider: 'http', baseUrl: url, model: 'stub-llm' } }), opt.stub);
    await sleep(5000); await speechReady(app);
    events.push('llm set to the local stub');
    await app.bridge(() => window.whisperer.settings.update({ autoPaste: false }));
    for (let i = 0; i < 5; i += 1) {
      await app.bridge(() => window.whisperer.recording.start());
      await sleep((refs.lead_silence_s + refs.clips[0].seconds + 0.5) * 1000);
      await app.bridge(() => window.whisperer.recording.stop());
      const n = i + 1;
      await waitFor(async () => (await app.bridge(() => window.whisperer.history.list())).length >= n, 120_000, `dictation ${n}`);
      events.push(`dictation ${n} done`);
      await sleep(20_000);
    }
    const meeting = await app.bridge(() => window.whisperer.meetings.capture.start({ title: 'Benchmark privacy session' }));
    await sleep(60_000);
    await app.bridge(() => window.whisperer.meetings.capture.stop());
    const m = await waitFor(async () => { const x = await app.bridge((id) => window.whisperer.meetings.get(id), meeting.id); if (x?.transcriptStatus === 'failed' || x?.summaryStatus === 'failed') throw new Error(JSON.stringify(x).slice(0, 200)); return x?.transcriptStatus === 'complete' && x?.summaryStatus === 'complete' && x; }, 10 * 60_000, 'meeting transcript and summary');
    events.push(`meeting transcript ${m.transcript.length} chars, summary ${m.summary.length} chars`);
    const remaining = Number(opt.minutes ?? 10) * 60_000 - (now() - started);
    if (remaining > 0) await sleep(remaining);
  } finally {
    fs.writeFileSync(stop, 'stop'); await sleep(4000); egress.kill();
    await close(app);
    const lines = fs.existsSync(egressFile) ? fs.readFileSync(egressFile, 'utf8').trim().split('\n').filter(Boolean) : [];
    fs.writeFileSync(path.join(opt.out, 'privacy.json'), JSON.stringify({ sessionMinutes: (now() - started) / 60_000, events, outboundConnections: lines.length, connections: lines }, null, 2));
    log(`privacy: ${lines.length} non-loopback connections; events ${events.join('; ')}`);
  }
}

const modes = { setup, coldstart, dictation, idle, privacy };
// Battery power throttles the CPU: refuse to start, and record the power state when the phase ends.
if (!acOnline()) { log(`ABORT ${mode}: not on AC power`); process.exit(3); }
process.on('exit', () => { try { fs.appendFileSync(logFile, `${new Date().toISOString()} on AC at end of ${mode}: ${acOnline()}
`); } catch { /* best effort */ } });
try { await modes[mode](); } catch (error) { log(`FAILED ${mode}: ${error.stack?.split('\n').slice(0, 3).join(' | ')}`); process.exitCode = 1; }
