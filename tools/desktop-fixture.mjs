/** Supply synthetic API responses for real desktop acceptance without production traffic. */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

/** The newer release the update check must find. Args: origin of the fixture. Returns: one Gitea release record. */
export function releaseFixture(origin) {
  const version = '99.0.0-beta.1';
  const names = ['mac-arm64.dmg', 'mac-x64.dmg', 'win-x64.exe', 'linux-amd64.deb', 'linux-arm64.deb'].map((suffix) => `Whisperer-${version}-${suffix}`);
  return {
    tag_name: `v${version}`,
    name: `Whisperer ${version}`,
    draft: false,
    prerelease: true,
    published_at: '2026-10-17T12:00:00Z',
    html_url: `${origin}/releases/tag/v${version}`,
    assets: names.map((name) => ({ name, size: 140_000_000, browser_download_url: `${origin}/releases/download/v${version}/${name}` })),
  };
}

/** Start an ephemeral loopback-only API. Args: optional synthetic transcription text or text factory. Returns: URL, request log and async close callback. */
export async function desktopFixture({ transcriptionText = 'Synthetic desktop dictation.' } = {}) {
  const requests = [];
  const notes = new Map();
  const dictionary = new Map();
  const meetings = new Map();
  const metrics = new Map();
  const identity = 'f1846761-fc98-456a-8d92-20c2bc5875fe';
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push({ method: request.method, path: url.pathname });
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    let body = {};
    if (request.headers['content-type']?.includes('application/json') && raw.length) body = JSON.parse(raw.toString());
    const reply = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    const empty = (status = 204) => { response.writeHead(status); response.end(); };
    if (url.pathname === '/v1/health') return reply({ status: 'ok', service: 'whisperer', version: 1 });
    // A public, Gitea-shaped release feed: one newer prerelease carrying an installer for every supported platform.
    if (/^\/api\/v1\/repos\/[^/]+\/[^/]+\/releases$/.test(url.pathname)) return reply([releaseFixture(`http://127.0.0.1:${server.address().port}`)]);
    if (url.pathname === '/device/poll') {
      if (!request.headers['x-whisperer-device-verifier']) return reply({ detail: 'Missing verifier' }, 401);
      return reply({ status: 'complete', accessToken: 'synthetic-desktop-access', refreshToken: 'synthetic-desktop-refresh', onboardingCompleted: false, provider: 'oidc' });
    }
    if (url.pathname === '/v1/auth/refresh') return reply({ accessToken: 'synthetic-desktop-access', refreshToken: 'synthetic-desktop-refresh' });
    if (url.pathname === '/v1/auth/logout') return empty();
    if (!request.headers.authorization) return reply({ detail: 'Sign in first' }, 401);
    if (['/v1/me', '/v1/auth/me'].includes(url.pathname)) {
      if (request.method === 'DELETE') return empty();
      return reply({ user: { id: identity, firstName: body.firstName ?? 'Desktop', lastName: body.lastName ?? 'Tester', onboardingCompleted: false } });
    }
    if (url.pathname === '/v1/transcriptions') {
      const text = typeof transcriptionText === 'function' ? transcriptionText() : transcriptionText;
      return reply({ id: randomUUID(), text, rawText: 'synthetic raw dictation', language: 'en', createdAt: new Date().toISOString(), dictionaryReplacements: 1 });
    }
    if (url.pathname.startsWith('/v1/dictation-metrics/')) {
      metrics.set(url.pathname.split('/').at(-1), body);
      return empty(200);
    }
    if (url.pathname === '/v1/metrics') {
      const values = [...metrics.values()];
      const totalWords = values.reduce((sum, item) => sum + item.outputWords, 0);
      const totalDurationMs = values.reduce((sum, item) => sum + item.durationMs, 0);
      return reply({
        totalWords, totalDurationMs, dictationCount: values.length,
        dictionaryReplacements: values.reduce((sum, item) => sum + item.dictionaryReplacements, 0),
        correctedWords: values.reduce((sum, item) => sum + (item.correctedWords ?? 0), 0),
        wordsPerMinute: totalDurationMs ? Math.round(totalWords * 60000 / totalDurationMs) : 0,
        wordsToday: totalWords, wordsThisWeek: totalWords, wordsThisMonth: totalWords, wordsLastMonth: 0,
        activeDays: values.length ? 1 : 0, dayStreak: values.length ? 1 : 0, longestDayStreak: values.length ? 1 : 0,
        weekStreak: values.length ? 1 : 0, timeZone: url.searchParams.get('timeZone') ?? 'UTC',
      });
    }
    if (url.pathname === '/v1/metrics/daily') return reply({ days: syntheticDays(url.searchParams.get('from'), url.searchParams.get('until')) });
    if (url.pathname === '/v1/metrics/apps') return reply({ items: [{ appName: 'Editor', words: 4210, durationMs: 1_800_000, dictationCount: 31 }, { appName: 'Mail', words: 1320, durationMs: 600_000, dictationCount: 12 }] });
    if (url.pathname === '/v1/text-transformations') return reply({ id: randomUUID(), text: `Proposed: ${body.text}`, sourceRevision: body.sourceRevision ?? null });
    if (url.pathname.startsWith('/v1/meetings')) return meetingRoute(url, request, body, raw, meetings, reply, empty);
    for (const [prefix, store] of [['/v1/notes', notes], ['/v1/dictionary', dictionary]]) {
      if (!url.pathname.startsWith(prefix)) continue;
      const parts = url.pathname.slice(prefix.length).split('/').filter(Boolean);
      const id = parts[0];
      if (request.method === 'GET' && !id) return reply({ items: [...store.values()] });
      if (request.method === 'POST' && !id) {
        const now = new Date().toISOString();
        const item = prefix.endsWith('notes') ? { id: randomUUID(), title: body.title, content: body.content, pinned: false, summary: null, createdAt: now, updatedAt: now } : { id: randomUUID(), phrase: body.phrase, replacement: body.replacement ?? '' };
        store.set(item.id, item);
        return reply(item, 201);
      }
      if (!store.has(id)) return reply({ detail: 'Not found' }, 404);
      if (request.method === 'DELETE') { store.delete(id); return empty(); }
      if (parts[1] === 'summary' || parts[1] === 'summarize') { const item = { ...store.get(id), summary: 'Synthetic summary of the saved note.' }; store.set(id, item); return reply(item); }
      if (['PATCH', 'PUT'].includes(request.method)) { const item = { ...store.get(id), ...body, updatedAt: new Date().toISOString() }; store.set(id, item); return reply(item); }
      return reply(store.get(id));
    }
    return reply({ detail: `Unsupported fixture route ${url.pathname}` }, 404);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}`, requests, metrics, meetings, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

/** Deterministic daily buckets so the heat map renders every level. Args: from and until are YYYY-MM-DD. Returns: one bucket per weekday. */
function syntheticDays(from, until) {
  const days = [];
  for (let day = new Date(`${from}T12:00:00Z`); day <= new Date(`${until}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const ordinal = Math.floor(day.getTime() / 86_400_000);
    if (ordinal % 7 === 3) continue;
    const words = 60 + (ordinal * 37) % 520;
    days.push({ date: day.toISOString().slice(0, 10), words, durationMs: words * 500, dictationCount: 1 + ordinal % 3, dictionaryReplacements: ordinal % 2, correctedWords: ordinal % 5 });
  }
  return days;
}

/** Emulate the backend-owned meeting lifecycle without retaining fixture audio. */
async function meetingRoute(url, request, body, raw, meetings, reply, empty) {
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts[2];
  if (request.method === 'GET' && !id) return reply({ items: [...meetings.values()], nextCursor: null });
  if (request.method === 'POST' && !id) {
    const meeting = { id: body.id ?? randomUUID(), title: body.title ?? '', startedAt: body.startedAt, endedAt: null, durationMs: 0, revision: 1, transcript: '', transcriptRevision: 0, summary: null, summaryRevision: 0, summarySourceRevision: null, summaryStale: false, transcriptStatus: 'pending', summaryStatus: 'idle', error: null, hasAudio: false };
    meetings.set(meeting.id, meetings.get(meeting.id) ?? meeting);
    return reply(meetings.get(meeting.id), 201);
  }
  const meeting = meetings.get(id);
  if (!meeting) return reply({ detail: 'Meeting not found.' }, 404);
  const update = (changes) => { const next = { ...meeting, ...changes, revision: meeting.revision + 1 }; meetings.set(id, next); return next; };
  if (request.method === 'DELETE') { meetings.delete(id); return empty(); }
  if (request.method === 'PATCH' && parts.length === 3) {
    if (request.headers['if-match'] !== String(meeting.revision)) return reply({ detail: 'The meeting changed.' }, 412);
    return reply(update(body));
  }
  if (parts[3] === 'resume') return reply(update({ endedAt: null, transcriptStatus: 'pending', summaryStatus: 'idle', summaryStale: meeting.summary !== null }));
  if (parts[3] === 'finish') {
    const transcript = meeting.transcript || 'Synthetic meeting transcript.';
    return reply(update({ endedAt: new Date().toISOString(), transcript, transcriptRevision: meeting.transcriptRevision + 1, transcriptStatus: 'complete', summary: 'Synthetic meeting summary.', summaryRevision: meeting.summaryRevision + 1, summarySourceRevision: meeting.transcriptRevision + 1, summaryStale: false, summaryStatus: 'complete' }));
  }
  if (parts[3] === 'segments') {
    const durationMs = Number(url.searchParams.get('durationMs') ?? 0);
    update({ durationMs: meeting.durationMs + durationMs, hasAudio: raw.length > 0, transcriptStatus: 'pending' });
    return reply({ id: parts[4], status: 'pending', durationMs, error: null }, 201);
  }
  if (parts[3] === 'questions' && request.method === 'POST') {
    if (body.question === 'Make the request fail') return reply({ detail: 'The configured language model is unavailable.' }, 502);
    if (body.question === 'Wait for the answer') await new Promise((resolve) => setTimeout(resolve, 1000));
    return reply({ answer: `Saved answer: ${body.question}`, transcriptRevision: meeting.transcriptRevision, summaryRevision: meeting.summaryRevision, summaryStale: meeting.summaryStale, usedSummary: meeting.summary !== null });
  }
  if (parts[3] === 'transcript' && request.method === 'PATCH') {
    if (request.headers['if-match'] !== String(meeting.transcriptRevision)) return reply({ detail: 'The meeting changed.' }, 412);
    const next = update({ transcript: body.text, transcriptRevision: meeting.transcriptRevision + 1, summaryStale: meeting.summary !== null });
    return reply({ text: next.transcript, revision: next.transcriptRevision, status: next.transcriptStatus, error: null });
  }
  if (parts[3] === 'summary' && parts[4] === 'regenerate') return reply(update({ summary: `Summary: ${meeting.transcript}`, summaryRevision: meeting.summaryRevision + 1, summarySourceRevision: meeting.transcriptRevision, summaryStale: false, summaryStatus: 'complete' }));
  if (parts[3] === 'summary' && request.method === 'PATCH') {
    if (request.headers['if-match'] !== String(meeting.summaryRevision)) return reply({ detail: 'The meeting changed.' }, 412);
    const next = update({ summary: body.text, summaryRevision: meeting.summaryRevision + 1, summarySourceRevision: meeting.transcriptRevision, summaryStale: false, summaryStatus: 'complete' });
    return reply({ text: next.summary, revision: next.summaryRevision, sourceRevision: next.summarySourceRevision, stale: false, status: 'complete', error: null });
  }
  return reply(meeting);
}
