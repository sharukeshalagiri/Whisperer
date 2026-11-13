// Runs the released on-device server (serve-local) exactly as the desktop starts it, then measures
// transcription through its HTTP API. No dependencies beyond Node 22.
//
// Usage: node bench_server.mjs <engine|meeting> --profile <desktop profile dir> --resources <app resources dir>
//                              --audio <dir from prepare_audio.py> --out <dir> [--runs 3] [--label name]
//   engine   POSTs the hour as the 4-minute 48 kHz WAV parts to /v1/transcriptions, one after another
//            (the dictation upload format), and times first request -> last result.
//   meeting  Replays the desktop's meeting calls: create meeting, upload the hour as one 24 kbit/s
//            Opus WebM segment, finish; then waits for the server's meeting worker to complete the
//            transcript. Times upload start ("recording finished") -> transcript complete.
// Model load is timed separately: process start -> /v1/inference/status reports speech ready.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const here = path.dirname(fileURLToPath(import.meta.url));
const acOnline = () => { try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[bool]((Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus).PowerOnline -contains $true)'], { encoding: 'utf8' }).trim() === 'True'; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
fs.mkdirSync(opt.out, { recursive: true });
const label = opt.label ?? mode;
const log = (line) => { const l = `${new Date().toISOString()} ${line}`; console.log(l); fs.appendFileSync(path.join(opt.out, `${label}.log`), `${l}\n`); };

function findPython(profile) {
  const envs = path.join(profile, 'runtime', 'envs');
  for (const key of fs.readdirSync(envs)) { const p = path.join(envs, key, 'Scripts', 'python.exe'); if (fs.existsSync(p)) return p; }
  throw new Error('no runtime environment in the profile');
}

/** Starts serve-local like LocalServerService: same argv, allowlisted environment, boot token on stdin. */
async function startServer() {
  const allowed = ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'windir', 'PATH', 'Path'];
  const env = { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', ORT_DISABLE_TELEMETRY: '1' };
  for (const name of allowed) if (typeof process.env[name] === 'string') env[name] = process.env[name];
  const token = randomBytes(32).toString('base64url');
  const t0 = now();
  const child = spawn(findPython(opt.profile), ['-B', '-E', '-s', '-m', 'whisperer_api', 'serve-local', '--config', path.join(opt.profile, 'device', 'local.json')],
    { cwd: path.join(opt.resources, 'api', 'apps', 'api', 'src'), env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  currentServer = child;
  child.stdin.write(`${JSON.stringify({ bootToken: token })}\n`);
  child.stderr.on('data', (d) => fs.appendFileSync(path.join(opt.out, `${label}.server.err`), d));
  const port = await new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (d) => {
      buffer += d; let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        try { const e = JSON.parse(line); if (e.event === 'bind') resolve(e.port); } catch { /* not an event */ }
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited ${code}`)));
    setTimeout(() => reject(new Error('no bind event')), 300_000);
  });
  const base = `http://127.0.0.1:${port}`;
  const headers = { authorization: `Bearer ${token}` };
  let status;
  for (;;) {
    try { status = await (await fetch(`${base}/v1/inference/status`, { headers })).json(); if (status?.speech?.status === 'ready') break; if (status?.speech?.status === 'failed') throw new Error(JSON.stringify(status.speech)); } catch (e) { if (/failed/.test(e.message)) throw e; }
    if (now() - t0 > 600_000) throw new Error(`speech not ready: ${JSON.stringify(status)}`);
    await sleep(100);
  }
  // A meeting left pending by an interrupted run would be transcribed in the background and skew this one.
  const meetings = await (await fetch(`${base}/v1/meetings`, { headers })).json();
  const busy = (meetings.items ?? []).filter((m) => !['complete', 'failed'].includes(m.transcriptStatus));
  if (busy.length) { child.kill(); throw new Error(`${busy.length} meeting(s) still pending in this profile; use a fresh profile`); }
  return { child, base, headers, loadMs: now() - t0, model: status.speech.model };
}

function sampleMemory(pid, name) {
  const csv = path.join(opt.out, `${name}-mem.csv`); const stop = path.join(opt.out, `${name}.stop`);
  fs.rmSync(stop, { force: true });
  const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'memsample.ps1'), String(pid), csv, stop, '2000'], { stdio: 'ignore' });
  return async () => {
    fs.writeFileSync(stop, 'stop'); await sleep(4000); proc.kill();
    const rows = fs.readFileSync(csv, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').map(Number));
    return { samples: rows.length, peakWorkingSetMb: Math.max(...rows.map((r) => r[2])), peakPrivateMb: Math.max(...rows.map((r) => r[3])) };
  };
}

async function stopServer(server) { server.child.stdin.end(); await sleep(3000); try { server.child.kill(); } catch { /* gone */ } await sleep(2000); }

async function engineRun(run) {
  const server = await startServer();
  const parts = fs.readdirSync(opt.audio).filter((f) => /^hour-48k-\d+\.wav$/.test(f)).sort();
  const stopMem = sampleMemory(server.child.pid, `${label}-run${run}`);
  const texts = []; const perPart = [];
  const t0 = now();
  for (const part of parts) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(path.join(opt.audio, part))], { type: 'audio/wav' }), part);
    const s = now();
    const response = await fetch(`${server.base}/v1/transcriptions?language=en&polish=false`, { method: 'POST', headers: server.headers, body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(`${part}: ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
    perPart.push({ part, ms: Math.round(now() - s) }); texts.push(body.text ?? '');
  }
  const totalMs = now() - t0;
  const memory = await stopMem();
  await stopServer(server);
  return { run, model: server.model, modelLoadMs: Math.round(server.loadMs), processingMs: Math.round(totalMs), parts: perPart, memory, text: texts.join(' ') };
}

async function meetingRun(run) {
  const server = await startServer();
  const manifest = JSON.parse(fs.readFileSync(path.join(opt.audio, 'hour.manifest.json'), 'utf8'));
  const stopMem = sampleMemory(server.child.pid, `${label}-run${run}`);
  const id = randomUUID(); const segment = randomUUID();
  const json = { ...server.headers, 'content-type': 'application/json' };
  let r = await fetch(`${server.base}/v1/meetings`, { method: 'POST', headers: json, body: JSON.stringify({ id, title: `Benchmark run ${run}`, startedAt: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`create ${r.status} ${await r.text()}`);
  const t0 = now();
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(path.join(opt.audio, 'hour.webm'))], { type: 'audio/webm' }), 'segment.webm');
  r = await fetch(`${server.base}/v1/meetings/${id}/segments/${segment}?durationMs=${Math.round(manifest.seconds * 1000)}&language=en`, { method: 'POST', headers: server.headers, body: form });
  if (!r.ok) throw new Error(`segment ${r.status} ${await r.text()}`);
  const uploadMs = now() - t0;
  r = await fetch(`${server.base}/v1/meetings/${id}/finish`, { method: 'POST', headers: server.headers });
  if (!r.ok) throw new Error(`finish ${r.status} ${await r.text()}`);
  let meeting;
  for (;;) {
    meeting = await (await fetch(`${server.base}/v1/meetings/${id}`, { headers: server.headers })).json();
    if (meeting.transcriptStatus === 'complete') break;
    if (meeting.transcriptStatus === 'failed') throw new Error(`transcript failed: ${meeting.error}`);
    await sleep(250);
  }
  const totalMs = now() - t0;
  const memory = await stopMem();
  await stopServer(server);
  return { run, model: server.model, modelLoadMs: Math.round(server.loadMs), uploadMs: Math.round(uploadMs), processingMs: Math.round(totalMs), summaryStatus: meeting.summaryStatus, memory, text: meeting.transcript };
}

// Memory guard: if free RAM drops below --min-free-mb (default 600) during a run, the server is
// stopped and the run is recorded as skipped for low memory, instead of the system killing the chain.
const minFreeMb = Number(opt['min-free-mb'] ?? 600);
let lowMemory = null; let lowestFreeMb = Infinity;
const guard = setInterval(() => {
  const free = os.freemem() / 1048576; lowestFreeMb = Math.min(lowestFreeMb, free);
  if (free < minFreeMb && !lowMemory && currentServer) {
    lowMemory = `free RAM fell to ${Math.round(free)} MB (< ${minFreeMb} MB)`;
    try { execFileSync('taskkill', ['/PID', String(currentServer.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  }
}, 1000);
let currentServer = null;
const results = [];
for (let run = 1; run <= Number(opt.runs ?? 3); run += 1) {
  try {
    // Battery power throttles the CPU: a run counts only if the machine was on AC at its start and end.
    lowMemory = null; lowestFreeMb = Infinity;
    const acAtStart = acOnline();
    if (!acAtStart) throw new Error('not on AC power at the start of the run');
    const result = mode === 'engine' ? await engineRun(run) : await meetingRun(run);
    result.onAcStartAndEnd = acAtStart && acOnline();
    if (!result.onAcStartAndEnd) result.invalid = 'AC power was lost during the run';
    result.lowestFreeMb = Math.round(lowestFreeMb);
    results.push(result);
    log(`${label} run ${run}: load ${result.modelLoadMs} ms, processing ${result.processingMs} ms, peak WS ${result.memory.peakWorkingSetMb} MB, ${result.text.split(/\s+/).length} words`);
  } catch (error) {
    const reason = lowMemory ? `skipped, low memory: ${lowMemory}` : error.message;
    log(`${label} run ${run} FAILED: ${reason}`);
    results.push(lowMemory ? { run, skipped: reason, lowestFreeMb: Math.round(lowestFreeMb) } : { run, failed: reason });
    if (lowMemory) { fs.writeFileSync(path.join(opt.out, `${label}.json`), JSON.stringify(results, null, 2)); log(`${label}: remaining runs skipped (low memory)`); break; }
  }
  fs.writeFileSync(path.join(opt.out, `${label}.json`), JSON.stringify(results, null, 2));
  await sleep(15_000);
}
clearInterval(guard);
