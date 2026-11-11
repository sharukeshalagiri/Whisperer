const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

/** Load the TypeScript platform service into Node's CommonJS test runtime. */
function loadPlatformService() {
  const filename = path.join(__dirname, 'PlatformService.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance._compile(compiled, filename);
  return instance.exports;
}

/** Build dependencies that make native side effects observable without Electron. */
function createDependencies(overrides = {}) {
  const clipboard = {
    writes: [],
    value: '',
    writeText(text) { this.writes.push(text); this.value = text; },
    readText() { return this.value; },
  };
  const globalShortcut = {
    registered: [],
    unregisterCalls: [],
    register(accelerator, handler) { this.registered.push({ accelerator, handler }); return true; },
    unregister(accelerator) { this.unregisterCalls.push(accelerator); },
  };
  return {
    platform: 'win32',
    environment: {},
    clipboard,
    globalShortcut,
    systemPreferences: {
      getMediaAccessStatus: () => 'not-determined',
      askForMediaAccess: async () => false,
      isTrustedAccessibilityClient: () => false,
    },
    shell: { openExternal: async () => undefined },
    execute: async () => ({ stdout: '' }),
    ...overrides,
  };
}

test('does not paste or change clipboard when the Windows focus changed before insertion', async () => {
  const { PlatformService } = loadPlatformService();
  let captureCalls = 0;
  const dependencies = createDependencies({
    execute: async () => {
      captureCalls += 1;
      return { stdout: captureCalls === 1 ? '100\n200\n' : '101\n200\n' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const result = await service.insertText('finished dictation', target);

  assert.deepEqual(result, { inserted: false, copied: false, reason: 'The focused window changed before text could be inserted.' });
  assert.deepEqual(dependencies.clipboard.writes, []);
});

test('passes Windows target identity as data rather than interpolating it into a command', async () => {
  const { PlatformService } = loadPlatformService();
  const invocations = [];
  const dependencies = createDependencies({
    execute: async (file, args, options) => {
      invocations.push({ file, args, options });
      return { stdout: '100\n200\n' };
    },
  });
  const service = new PlatformService(dependencies);

  const result = await service.insertText('safe text', { platform: 'win32', hwnd: '100; Write-Output pwned', processId: '200' });

  assert.deepEqual(result, { inserted: false, copied: false, reason: 'The saved Windows target is invalid.' });
  assert.equal(invocations.length, 0);
  assert.deepEqual(dependencies.clipboard.writes, []);
});

test('reports Linux Wayland insertion as unsupported without executing xdotool', async () => {
  const { PlatformService } = loadPlatformService();
  let executions = 0;
  const service = new PlatformService(createDependencies({
    platform: 'linux',
    environment: { XDG_SESSION_TYPE: 'wayland' },
    execute: async () => { executions += 1; return { stdout: '' }; },
  }));

  const status = await service.capabilityStatus();
  const result = await service.insertText('safe text', { platform: 'linux', windowId: '1', processId: '2' });

  assert.equal(status.autoPaste.supported, false);
  assert.match(status.autoPaste.reason, /Wayland/i);
  assert.deepEqual(result, { inserted: false, copied: false, reason: status.autoPaste.reason });
  assert.equal(executions, 0);
});

test('reports a global shortcut collision rather than claiming registration succeeded', () => {
  const { PlatformService } = loadPlatformService();
  const service = new PlatformService(createDependencies({
    globalShortcut: { register: () => false, unregister: () => undefined },
  }));

  const result = service.registerShortcut('CommandOrControl+Shift+Space', () => undefined);

  assert.deepEqual(result, {
    registered: false,
    accelerator: 'CommandOrControl+Shift+Space',
    reason: 'The shortcut is unavailable because another application is using it.',
  });
});

test('pastes to a still-focused Windows target using bounded execFile options', async () => {
  const { PlatformService } = loadPlatformService();
  const invocations = [];
  const dependencies = createDependencies({
    execute: async (file, args, options) => {
      invocations.push({ file, args, options });
      if (invocations.length <= 2) return { stdout: '100\n200\n' };
      return { stdout: 'sent\n' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const result = await service.insertText('finished dictation', target);

  assert.deepEqual(result, { inserted: true, copied: true });
  assert.deepEqual(dependencies.clipboard.writes, ['finished dictation']);
  assert.equal(invocations[2].file, 'powershell.exe');
  assert.equal(invocations[2].options.timeout, 5000);
  assert.equal(invocations[2].options.shell, false);
  assert.equal(invocations[2].args.includes('100'), false);
  assert.equal(invocations[2].args.includes('200'), false);
  assert.equal(invocations[2].options.env.WHISPERER_TARGET_HWND, '100');
  assert.equal(invocations[2].options.env.WHISPERER_TARGET_PID, '200');
  assert.doesNotMatch(invocations[2].args[3], /100|200/);
});

test('captures and pastes into the frontmost macOS application without a window id', async () => {
  const { PlatformService } = loadPlatformService();
  const invocations = [];
  const dependencies = createDependencies({
    platform: 'darwin',
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true, isTrustedAccessibilityClient: () => true },
    execute: async (file, args, options) => {
      invocations.push({ file, args, options });
      if (args[1].includes('keystroke')) return { stdout: 'sent\n' };
      return { stdout: 'com.example.editor\n4242\n' };
    },
  });
  const service = new PlatformService(dependencies);

  const target = await service.captureTarget();
  const result = await service.insertText('finished dictation', target);

  assert.deepEqual(target, { platform: 'darwin', bundleId: 'com.example.editor', processId: '4242' });
  assert.deepEqual(result, { inserted: true, copied: true });
  assert.deepEqual(dependencies.clipboard.writes, ['finished dictation']);
  assert.deepEqual(invocations.at(-1).args.slice(2), ['com.example.editor', '4242']);
  assert.equal(invocations.at(-1).options.shell, false);
});

test('explains a missing macOS Accessibility grant instead of a missing target', async () => {
  const { PlatformService } = loadPlatformService();
  const dependencies = createDependencies({ platform: 'darwin' });
  const service = new PlatformService(dependencies);

  const result = await service.insertText('finished dictation', { platform: 'darwin', bundleId: 'com.example.editor', processId: '1' });

  assert.equal(result.inserted, false);
  assert.match(result.reason, /Accessibility/);
  assert.deepEqual(dependencies.clipboard.writes, []);
});

test('resets a stale macOS Accessibility grant and opens its settings page', async () => {
  const { PlatformService } = loadPlatformService();
  const invocations = [];
  const opened = [];
  const prompts = [];
  const service = new PlatformService(createDependencies({
    platform: 'darwin',
    bundleId: 'ai.whisperer.private',
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true, isTrustedAccessibilityClient: (prompt) => { prompts.push(prompt); return false; } },
    shell: { openExternal: async (url) => { opened.push(url); } },
    execute: async (file, args, options) => { invocations.push({ file, args, options }); return { stdout: '' }; },
  }));

  const result = await service.requestPermission('accessibility');

  assert.equal(result.ok, false);
  assert.deepEqual(invocations[0].args, ['reset', 'Accessibility', 'ai.whisperer.private']);
  assert.equal(invocations[0].file, '/usr/bin/tccutil');
  assert.equal(invocations[0].options.shell, false);
  assert.deepEqual(prompts, [false, true]);
  assert.match(opened[0], /Privacy_Accessibility/);
});

test('reports macOS Automation as unchecked until probed, then as granted', async () => {
  const { PlatformService } = loadPlatformService();
  const service = new PlatformService(createDependencies({ platform: 'darwin', execute: async () => ({ stdout: 'Finder\n' }) }));

  assert.deepEqual((await service.capabilityStatus()).automation, { supported: true, granted: false, reason: 'Not checked yet.' });
  assert.equal(await service.probeAutomation(), true);
  assert.deepEqual((await service.capabilityStatus()).automation, { supported: true, granted: true, reason: null });
});

test('reports a declined macOS microphone request as declined', async () => {
  const { PlatformService } = loadPlatformService();
  const service = new PlatformService(createDependencies({
    platform: 'darwin',
    systemPreferences: {
      getMediaAccessStatus: () => 'not-determined',
      askForMediaAccess: async () => false,
      isTrustedAccessibilityClient: () => false,
    },
  }));

  const result = await service.requestPermission('microphone');

  assert.deepEqual(result, { ok: false, reason: 'Microphone access was not granted.' });
});

test('reports injected hold-to-talk capability only when native registration is actually available', async () => {
  const { PlatformService } = loadPlatformService();
  const holdShortcut = {
    capability: () => ({ supported: true, granted: true, reason: null }),
    register: () => ({ registered: true, accelerator: 'Space' }),
    unregister: () => undefined,
  };
  const service = new PlatformService(createDependencies({ holdShortcut }));

  const status = await service.capabilityStatus();

  assert.deepEqual(status.holdToTalk, { supported: true, granted: true, reason: null });
});

test('uses the shared renderer capability shape for unavailable platform features', async () => {
  const { PlatformService } = loadPlatformService();
  const service = new PlatformService(createDependencies({
    platform: 'linux',
    environment: { XDG_SESSION_TYPE: 'wayland' },
  }));

  const status = await service.capabilityStatus();

  assert.deepEqual(status.autoPaste, {
    supported: false,
    granted: false,
    reason: 'Wayland insertion is unavailable because no consent-based adapter is installed.',
  });
  assert.equal(status.systemAudio.supported, false);
  assert.equal(status.holdToTalk.granted, false);
  assert.equal(status.microphone.supported, true);
});

test('targets the captured X11 window rather than mutable foreground focus', async () => {
  const { PlatformService } = loadPlatformService();
  const calls = [];
  const service = new PlatformService(createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    execute: async (file, args, options) => {
      calls.push({ file, args, options });
      if (args[0] === 'getwindowfocus') return { stdout: '123\n' };
      if (args[0] === 'getwindowpid') return { stdout: '456\n' };
      return { stdout: '' };
    },
  }));
  const target = await service.captureTarget();

  const result = await service.insertText('finished dictation', target);

  assert.deepEqual(result, { inserted: true, copied: true });
  assert.deepEqual(calls.at(-1), {
    file: 'xdotool',
    args: ['key', '--window', '123', '--clearmodifiers', 'ctrl+v'],
    options: { timeout: 2000, shell: false },
  });
});

test('captures an X11 selection only from the saved focused target and restores the clipboard', async () => {
  const { PlatformService } = loadPlatformService();
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    clipboard: {
      writes: [],
      value: 'original clipboard',
      writeText(text) { this.writes.push(text); this.value = text; },
      readText() { return this.value; },
    },
    execute: async (_file, args) => {
      if (args[0] === 'getwindowfocus') return { stdout: '123\n' };
      if (args[0] === 'getwindowpid') return { stdout: '456\n' };
      if (args[0] === 'key' && args.at(-1) === 'ctrl+c') dependencies.clipboard.value = 'selected source';
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const selection = await service.captureSelection(target);

  assert.deepEqual(selection, { text: 'selected source' });
  assert.equal(dependencies.clipboard.writes.length, 2);
  assert.match(dependencies.clipboard.writes[0], /^whisperer-selection-/);
  assert.equal(dependencies.clipboard.writes.at(-1), 'original clipboard');
});

test('captures an X11 selection even when it already equals the clipboard', async () => {
  const { PlatformService } = loadPlatformService();
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    clipboard: {
      writes: [],
      value: 'selected source',
      writeText(text) { this.writes.push(text); this.value = text; },
      readText() { return this.value; },
    },
    execute: async (_file, args) => {
      if (args[0] === 'getwindowfocus') return { stdout: '123\n' };
      if (args[0] === 'getwindowpid') return { stdout: '456\n' };
      if (args[0] === 'key' && args.at(-1) === 'ctrl+c') dependencies.clipboard.value = 'selected source';
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const selection = await service.captureSelection(target);

  assert.deepEqual(selection, { text: 'selected source' });
  assert.equal(dependencies.clipboard.value, 'selected source');
});

test('restores a captured X11 target only from the still-focused review window', async () => {
  const { PlatformService } = loadPlatformService();
  let focus = '123';
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    clipboard: {
      writes: [],
      value: 'original clipboard',
      writeText(text) { this.writes.push(text); this.value = text; },
      readText() { return this.value; },
    },
    execute: async (_file, args) => {
      if (args[0] === 'getwindowfocus') return { stdout: `${focus}\n` };
      if (args[0] === 'getwindowpid') return { stdout: `${args.at(-1) === '999' ? '888' : '456'}\n` };
      if (args[0] === 'windowactivate' && args.at(-1) === '123') focus = '123';
      if (args[0] === 'key' && args.at(-1) === 'ctrl+c') dependencies.clipboard.value = 'selected source';
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();
  focus = '999';

  const result = await service.replaceSelection('accepted replacement', target, {
    sourceText: 'selected source',
    reviewTarget: { platform: 'linux', windowId: '999', processId: '888' },
  });

  assert.deepEqual(result, { applied: true });
});

test('does not restore an X11 target after focus leaves the captured review window', async () => {
  const { PlatformService } = loadPlatformService();
  const calls = [];
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    execute: async (_file, args) => {
      calls.push(args);
      if (args[0] === 'getwindowfocus') return { stdout: '777\n' };
      if (args[0] === 'getwindowpid') return { stdout: '666\n' };
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);

  const result = await service.replaceSelection('accepted replacement', { platform: 'linux', windowId: '123', processId: '456' }, {
    sourceText: 'selected source',
    reviewTarget: { platform: 'linux', windowId: '999', processId: '888' },
  });

  assert.deepEqual(result, { applied: false, reason: 'The review window lost focus before the replacement could be applied.' });
  assert.equal(calls.some((args) => args[0] === 'windowactivate'), false);
});

test('replaces only an unchanged X11 selection in its captured target', async () => {
  const { PlatformService } = loadPlatformService();
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    clipboard: {
      writes: [],
      value: 'original clipboard',
      writeText(text) { this.writes.push(text); this.value = text; },
      readText() { return this.value; },
    },
    execute: async (_file, args) => {
      if (args[0] === 'getwindowfocus') return { stdout: '123\n' };
      if (args[0] === 'getwindowpid') return { stdout: '456\n' };
      if (args[0] === 'key' && args.at(-1) === 'ctrl+c') dependencies.clipboard.value = 'selected source';
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const result = await service.replaceSelection('accepted replacement', target, { sourceText: 'selected source', reviewTarget: target });

  assert.deepEqual(result, { applied: true });
  assert.equal(dependencies.clipboard.writes.length, 3);
  assert.match(dependencies.clipboard.writes[0], /^whisperer-selection-/);
  assert.deepEqual(dependencies.clipboard.writes.slice(-2), ['original clipboard', 'accepted replacement']);
});

test('sends Enter through a fixed bounded X11 adapter without a shell', async () => {
  const { PlatformService } = loadPlatformService();
  const calls = [];
  const service = new PlatformService(createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    execute: async (file, args, options) => { calls.push({ file, args, options }); return { stdout: '' }; },
  }));

  await service.pressEnter();

  assert.deepEqual(calls.at(-1), { file: 'xdotool', args: ['key', '--clearmodifiers', 'Return'], options: { timeout: 2000, shell: false } });
});

test('parses a Windows target handle with an API Windows PowerShell 5.1 provides', async () => {
  const calls = [];
  const { PlatformService } = loadPlatformService();
  const service = new PlatformService(createDependencies({
    platform: 'win32',
    execute: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: calls.length === 1 ? '99\n7\n' : 'sent\n' };
    },
  }));

  await service.replaceSelection('Replacement', { platform: 'win32', hwnd: '1234', processId: '42' }, { sourceText: 'Source', reviewTarget: { platform: 'win32', hwnd: '99', processId: '7' } });

  const restore = calls.find(({ args }) => args.at(-1).includes('SetForegroundWindow'));
  assert.ok(restore, 'Accepting a Windows replacement must restore the captured window.');
  // .NET Framework has no IntPtr.Parse, so the handle must parse as an int64 first.
  assert.match(restore.args.at(-1), /\[IntPtr\]\[int64\]::Parse\(\$env:WHISPERER_TARGET_HWND\)/);
  assert.doesNotMatch(restore.args.at(-1), /\[IntPtr\]::Parse/);
});

/** Electron 44's clipboard: writes commit asynchronously and reads return promises. */
function asyncClipboard(initial) {
  return {
    writes: [],
    value: initial,
    writeText(text) {
      this.writes.push(text);
      return new Promise((resolve) => setTimeout(() => { this.value = text; resolve(); }, 20));
    },
    async readText() { return this.value; },
  };
}

test('captures an X11 selection when clipboard writes commit asynchronously', async () => {
  const { PlatformService } = loadPlatformService();
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    clipboard: asyncClipboard('original clipboard'),
    execute: async (_file, args) => {
      if (args[0] === 'getwindowfocus') return { stdout: '123\n' };
      if (args[0] === 'getwindowpid') return { stdout: '456\n' };
      if (args[0] === 'key' && args.at(-1) === 'ctrl+c') dependencies.clipboard.value = 'selected source';
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const selection = await service.captureSelection(target);

  assert.deepEqual(selection, { text: 'selected source' });
  assert.equal(dependencies.clipboard.value, 'original clipboard');
});

test('pastes on X11 only after the dictation is on the clipboard', async () => {
  const { PlatformService } = loadPlatformService();
  let clipboardAtPaste = null;
  const dependencies = createDependencies({
    platform: 'linux',
    environment: { DISPLAY: ':0' },
    clipboard: asyncClipboard('older clipboard'),
    execute: async (_file, args) => {
      if (args[0] === 'getwindowfocus') return { stdout: '123\n' };
      if (args[0] === 'getwindowpid') return { stdout: '456\n' };
      if (args[0] === 'key' && args.at(-1) === 'ctrl+v') clipboardAtPaste = dependencies.clipboard.value;
      return { stdout: '' };
    },
  });
  const service = new PlatformService(dependencies);
  const target = await service.captureTarget();

  const result = await service.insertText('finished dictation', target);

  assert.equal(result.inserted, true);
  assert.equal(clipboardAtPaste, 'finished dictation');
});
