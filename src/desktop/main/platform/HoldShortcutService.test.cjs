const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

/** Load one TypeScript module into Node's CommonJS test runtime. */
function loadModule(filename) {
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
  // Relative TypeScript imports such as ../../shared/shortcuts are compiled the same way.
  instance.require = (request) => request.startsWith('.')
    ? loadModule(path.resolve(path.dirname(filename), `${request}.ts`))
    : require(request);
  instance._compile(compiled, filename);
  return instance.exports;
}

/** Make an injected native hook that exposes only lifecycle and keyboard events. */
function createHook() {
  const listeners = new Map();
  return {
    starts: 0,
    stops: 0,
    on(event, listener) { listeners.set(event, listener); return this; },
    off(event, listener) { if (listeners.get(event) === listener) listeners.delete(event); return this; },
    start() { this.starts += 1; },
    stop() { this.stops += 1; },
    emit(event, payload) { listeners.get(event)?.(payload); },
  };
}

test('starts only for the configured hold chord and stops when its modifier is released', () => {
  const { HoldShortcutService } = loadModule(path.join(__dirname, 'HoldShortcutService.ts'));
  const hook = createHook();
  const service = new HoldShortcutService({
    platform: 'win32',
    environment: {},
    isInstalled: () => true,
    createNative: () => ({ hook, keys: { Space: 57 } }),
  });
  let starts = 0;
  let stops = 0;

  const registration = service.register('CommandOrControl+Shift+Space', {
    onStart: () => { starts += 1; },
    onStop: () => { stops += 1; },
  }, true);
  hook.emit('keydown', { keycode: 57, metaKey: false, ctrlKey: true, shiftKey: true, altKey: false });
  hook.emit('keyup', { keycode: 42, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false });

  assert.deepEqual(registration, { registered: true, accelerator: 'CommandOrControl+Shift+Space' });
  assert.equal(starts, 1);
  assert.equal(stops, 1);
  assert.equal(hook.starts, 1);
});

test('does not load or capture keyboard events until hold-to-talk is explicitly enabled', () => {
  const { HoldShortcutService } = loadModule(path.join(__dirname, 'HoldShortcutService.ts'));
  let loaded = 0;
  const service = new HoldShortcutService({
    platform: 'win32',
    environment: {},
    isInstalled: () => true,
    createNative: () => { loaded += 1; return { hook: createHook(), keys: { Space: 57 } }; },
  });

  const registration = service.register('Space', { onStart: () => undefined, onStop: () => undefined }, false);

  assert.deepEqual(registration, {
    registered: false,
    accelerator: 'Space',
    reason: 'Hold-to-talk is disabled.',
  });
  assert.equal(loaded, 0);
});

test('resolves the configured target key from the loaded native library instead of hard-coded scancodes', () => {
  const { HoldShortcutService } = loadModule(path.join(__dirname, 'HoldShortcutService.ts'));
  const hook = createHook();
  const service = new HoldShortcutService({
    platform: 'win32',
    environment: {},
    isInstalled: () => true,
    createNative: () => ({ hook, keys: { H: 333 } }),
  });
  let starts = 0;

  service.register('H', { onStart: () => { starts += 1; }, onStop: () => undefined }, true);
  hook.emit('keydown', { keycode: 35, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
  assert.equal(starts, 0);
  hook.emit('keyup', { keycode: 35, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
  hook.emit('keydown', { keycode: 333, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });

  assert.equal(starts, 1);
});

test('refuses hold-to-talk on Wayland without loading the native hook', () => {
  const { HoldShortcutService } = loadModule(path.join(__dirname, 'HoldShortcutService.ts'));
  let loaded = 0;
  const service = new HoldShortcutService({
    platform: 'linux',
    environment: { XDG_SESSION_TYPE: 'wayland' },
    isInstalled: () => true,
    createNative: () => { loaded += 1; return { hook: createHook(), keys: { Space: 57 } }; },
  });

  const capability = service.capability();
  const registration = service.register('Space', { onStart: () => undefined, onStop: () => undefined }, true);

  assert.deepEqual(capability, {
    supported: false,
    granted: false,
    reason: 'Hold-to-talk is unavailable in Wayland sessions.',
  });
  assert.equal(registration.registered, false);
  assert.equal(loaded, 0);
});

test('activates a modifier-only chord and lets a larger chord upgrade without releasing it', () => {
  const { HoldShortcutService } = loadModule(path.join(__dirname, 'HoldShortcutService.ts'));
  const hook = createHook();
  const service = new HoldShortcutService({
    platform: 'linux', environment: { DISPLAY: ':0' }, isInstalled: () => true,
    createNative: () => ({ hook, keys: { Ctrl: 29, Alt: 56, Space: 57 } }),
  });
  const calls = [];
  service.registerMany([
    { accelerator: 'Control+Alt', callbacks: { onStart: () => calls.push('hold'), onStop: () => calls.push('release') } },
    { accelerator: 'Control+Alt+Space', callbacks: { onStart: () => calls.push('toggle'), onStop: () => undefined } },
  ], true);
  hook.emit('keydown', { keycode: 29, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false });
  hook.emit('keydown', { keycode: 56, ctrlKey: true, altKey: true, metaKey: false, shiftKey: false });
  hook.emit('keydown', { keycode: 57, ctrlKey: true, altKey: true, metaKey: false, shiftKey: false });
  hook.emit('keyup', { keycode: 56, ctrlKey: true, altKey: false, metaKey: false, shiftKey: false });

  assert.deepEqual(calls, ['hold', 'toggle', 'release']);
});

test('ordinary typing is never kept, reported or logged', () => {
  const { HoldShortcutService } = loadModule(path.join(__dirname, 'HoldShortcutService.ts'));
  const hook = createHook();
  const service = new HoldShortcutService({
    platform: 'win32',
    environment: {},
    isInstalled: () => true,
    createNative: () => ({ hook, keys: { Space: 57 } }),
  });
  let callbacks = 0;
  service.register('CommandOrControl+Shift+Space', { onStart: () => { callbacks += 1; }, onStop: () => { callbacks += 1; } }, true);
  const logged = [];
  const originals = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[method] = console[method];
    console[method] = (...args) => { logged.push(args); };
  }
  try {
    // "password" typed on a US layout: plain letters, no shortcut modifiers.
    for (const keycode of [25, 30, 31, 31, 17, 24, 19, 32]) {
      hook.emit('keydown', { keycode, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
      hook.emit('keyup', { keycode, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
    }
  } finally {
    Object.assign(console, originals);
  }
  assert.equal(callbacks, 0);
  assert.equal(service.pressed.size, 0, 'no keycode outlives its key-up');
  assert.deepEqual(logged, []);
});
