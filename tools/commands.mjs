#!/usr/bin/env node
/** Run portable setup, development, and packaging commands for this checkout. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, 'tools');
const brand = path.join(root, 'assets', 'brand');
const minimumNodeVersion = [22, 18, 0];

/**
 * Reject Node.js versions that cannot install this checkout's locked tooling.
 *
 * Args: None.
 * Returns: Nothing when the current Node.js version is supported.
 * Raises: Error when Node.js is older than 22.18.0.
 */
function requireSupportedNode() {
  const current = process.versions.node.split('.').map(Number);
  for (let index = 0; index < minimumNodeVersion.length; index += 1) {
    const value = current[index] ?? 0;
    const minimum = minimumNodeVersion[index];
    if (value > minimum) return;
    if (value < minimum) {
      throw new Error(`Node.js 22.18.0 or newer is required; found ${process.versions.node}.`);
    }
  }
}

const descriptions = {
  help: 'List available commands.',
  setup: 'Install locked desktop dependencies and build the desktop application.',
  'desktop-build': 'Build the TypeScript Electron application.',
  'desktop-test': 'Run desktop unit tests.',
  'desktop-lint': 'Check desktop types and lint.',
  linux: 'Build an Ubuntu Debian package.',
  desktop: 'Start the Electron desktop client.',
  server: 'Start the API server for development.',
  windows: 'Build the Windows installer natively on Windows or through Docker.',
  dmg: 'Build Apple Silicon and Intel macOS DMGs on macOS only.',
  'macos-zip': 'Build unsigned macOS ZIP archives.',
  'brand-setup': 'Create the optional brand Python environment and install its locked dependencies.',
  brand: 'Regenerate brand source assets using the optional Python environment.',
  'docs-check': 'Verify AGENTS.md, the CLAUDE.md shim and any README in every tracked folder.',
  'api-setup': 'Install the locked Python API workspace and development tools.',
  'api-test': 'Run the API test suite from its locked workspace.',
  'api-lint': 'Run API formatting and static type checks.',
  'api-contract': 'Regenerate the OpenAPI contract and fail if it is stale.',
  'api-preflight': 'Validate API runtime configuration without starting a server.',
  'api-build': 'Build the production API Docker image.',
  'api-up': 'Build and start the Compose API, then wait for liveness.',
  'api-down': 'Stop the Compose API without deleting its data volume.',
  'api-status': 'Show the Compose API deployment status.',
  'api-logs': 'Show recent API container logs without dumping environment values.',
  'stack-up': 'Start the API with its inference; STACK=cloud|cpu|nvidia|apple, hardware detected when unset.',
  'stack-down': 'Stop the running stack without deleting models or data.',
  'stack-status': 'Show the running stack status.',
  'stack-config': 'Validate the merged Compose file for every stack.',
};

/**
 * Run one program without relying on a POSIX shell.
 *
 * Args:
 *   program: Executable to start.
 *   args: Literal argument vector for the executable.
 *   options: Optional working directory and Windows shell compatibility flag.
 * Returns:
 *   Nothing when the program exits successfully.
 * Raises:
 *   Error when the program cannot start or returns a failure status.
 */
function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    shell: options.shell ?? false,
  });
  if (result.error) throw new Error(`could not start ${program}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit status ${result.status}`;
    throw new Error(`${program} failed with ${detail}`);
  }
}

/**
 * Run npm using its Windows command wrapper only where that is required.
 *
 * Args:
 *   args: Literal npm argument vector.
 *   cwd: Directory containing the relevant package manifest.
 * Returns:
 *   Nothing when npm succeeds.
 * Raises:
 *   Error when npm cannot complete the requested command.
 */
function npm(args, cwd = root) {
  if (process.platform === 'win32') {
    // npm is a .cmd shim on Windows and requires CMD's command dispatch.
    run('npm.cmd', args, { cwd, shell: true });
    return;
  }
  run('npm', args, { cwd });
}

/**
 * Install the locked desktop dependencies and build the desktop application.
 *
 * Args: None.
 * Returns: Nothing after installation and compilation succeed.
 * Raises: Error when dependency installation or compilation fails.
 */
function setup() {
  // All native runtime dependencies ship prebuilds; skip lifecycle scripts that may invoke unavailable compilers.
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  // Electron exposes an installer command rather than a postinstall hook.
  run(process.execPath, [path.join(root, 'node_modules', 'electron', 'install.js')]);
  desktopBuild();
}

/**
 * Compile the main, preload and renderer targets.
 *
 * Args: None.
 * Returns: Nothing after compilation succeeds.
 * Raises: Error when the TypeScript application cannot be built.
 */
function desktopBuild() {
  npm(['run', 'build:desktop']);
}

/**
 * Build the Windows installer using the native toolchain or the pinned Docker toolchain.
 *
 * Args: None.
 * Returns: Nothing after the installer build succeeds.
 * Raises: Error when the selected native or Docker toolchain fails.
 */
function windows() {
  desktopBuild();
  if (process.platform === 'win32') {
    npm(['run', 'dist:windows']);
    return;
  }

  run('docker', ['build', '--platform', 'linux/amd64', '-f', path.join(tools, 'Dockerfile.windows'), '-t', 'whisperer-windows-builder', tools]);
  const uid = typeof process.getuid === 'function' ? String(process.getuid()) : '0';
  const gid = typeof process.getgid === 'function' ? String(process.getgid()) : '0';
  const build = [
    'xvfb-run -a sh -lc "wineboot --init && wine cmd.exe /c echo Wine-ready && npm run dist:windows"',
    'status=$?',
    'chown -R "$BUILD_UID:$BUILD_GID" /project/dist /project/out',
    'exit "$status"',
  ].join('\n');
  run('docker', [
    'run', '--rm', '--platform', 'linux/amd64',
    '-e', `BUILD_UID=${uid}`,
    '-e', `BUILD_GID=${gid}`,
    '--mount', `type=bind,src=${root},dst=/project`,
    '-w', '/project',
    'whisperer-windows-builder',
    'sh', '-lc', build,
  ]);
}

/**
 * Build Apple Silicon and Intel macOS DMGs with macOS-native packaging utilities.
 *
 * Args: None.
 * Returns: Nothing after the DMG build succeeds.
 * Raises: Error when called outside macOS or when packaging fails.
 */
function dmg() {
  if (process.platform !== 'darwin') throw new Error('DMG packaging requires macOS with hdiutil.');
  desktopBuild();
  npm(['run', 'dist:macos']);
}

/**
 * Select the Python launcher appropriate for the current operating system.
 *
 * Args: None.
 * Returns: The program and fixed launcher arguments.
 */
function pythonLauncher() {
  return process.platform === 'win32'
    ? { program: 'py', args: ['-3'] }
    : { program: 'python3', args: [] };
}

/**
 * Return the virtual-environment Python executable path for the current platform.
 *
 * Args: None.
 * Returns: Absolute path to the optional brand environment's Python executable.
 */
function brandPython() {
  return process.platform === 'win32'
    ? path.join(brand, '.venv', 'Scripts', 'python.exe')
    : path.join(brand, '.venv', 'bin', 'python');
}

/**
 * Create the isolated Python environment used solely for optional brand regeneration.
 *
 * Args: None.
 * Returns: Nothing after the brand dependencies are installed.
 * Raises: Error when Python cannot create the environment or install requirements.
 */
function brandSetup() {
  const launcher = pythonLauncher();
  run(launcher.program, [...launcher.args, '-m', 'venv', path.join(brand, '.venv')]);
  run(brandPython(), ['-m', 'pip', 'install', '--requirement', path.join(brand, 'requirements.txt')]);
}

/**
 * Recreate generated brand assets from their tracked source definitions.
 *
 * Args: None.
 * Returns: Nothing after both asset generators succeed.
 * Raises: Error when the optional brand environment has not been installed or generation fails.
 */
function regenerateBrand() {
  if (!fs.existsSync(brandPython())) {
    throw new Error('brand environment is missing; run make brand-setup first.');
  }
  run(brandPython(), ['sources.py'], { cwd: brand });
  run(brandPython(), ['generate.py'], { cwd: brand });
}

/**
 * Install the locked API workspace including its development tools.
 *
 * Args: None.
 * Returns: Nothing after uv installs the locked workspace.
 * Raises: Error when uv cannot resolve the committed lockfile.
 */
function apiSetup() {
  // The `local` extra holds the on-device speech runtime so its decode and ONNX tests run in CI.
  run('uv', ['sync', '--locked', '--all-packages', '--all-groups', '--extra', 'local']);
}

/**
 * Run API quality checks that do not require a network service.
 *
 * Args: None.
 * Returns: Nothing after lint and type checks pass.
 * Raises: Error when either static check fails.
 */
function apiLint() {
  apiSetup();
  run('uv', ['run', '--locked', '--all-packages', 'ruff', 'check', 'apps/api']);
  run('uv', ['run', '--locked', '--all-packages', 'mypy', 'apps/api/src']);
}

/**
 * Regenerate the OpenAPI document and verify that it is committed.
 *
 * Args: None.
 * Returns: Nothing when the generated contract has no uncommitted changes.
 * Raises: Error when the contract is missing or stale.
 */
function apiContract() {
  const contractPaths = ['apps/api/openapi.json', 'packages/api-client'];
  apiSetup();
  run('uv', ['run', '--locked', '--all-packages', 'python', '-m', 'whisperer_api', 'openapi', '--output', contractPaths[0]]);
  npm(['run', 'api:generate']);
  for (const contractPath of contractPaths) {
    run('git', ['ls-files', '--error-unmatch', '--', contractPath]);
  }
  run('git', ['diff', '--exit-code', '--', ...contractPaths]);
}

/**
 * Run the API's local configuration preflight without starting its HTTP server.
 *
 * Args: None.
 * Returns: Nothing after the preflight completes.
 * Raises: Error when local configuration is invalid.
 */
function apiPreflight() {
  apiSetup();
  run('uv', ['run', '--locked', '--all-packages', 'python', '-m', 'whisperer_api', 'preflight']);
}

const stacks = ['cloud', 'cpu', 'nvidia', 'apple'];

/**
 * Report whether the root .env assigns a nonblank value to any of the given names.
 *
 * Args:
 *   names: Variable names to look for.
 * Returns: True when .env exists and sets one of them.
 */
function envFileDefines(...names) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).some((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    return Boolean(match && names.includes(match[1]) && match[2].replace(/^["']|["']$/g, '').trim());
  });
}

/**
 * Pick the stack from STACK or, for local inference, from the host hardware.
 *
 * Args: None.
 * Returns: One of `stacks`.
 * Raises: Error when STACK names an unknown stack.
 */
function selectedStack() {
  const requested = process.env.STACK?.trim();
  if (requested) {
    if (!stacks.includes(requested)) {
      throw new Error(`unknown STACK ${requested}; use one of ${stacks.join(', ')}.`);
    }
    return requested;
  }
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'apple';
  // A working driver answers nvidia-smi; the Container Toolkit is checked by Compose itself.
  const nvidia = spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' });
  return nvidia.status === 0 ? 'nvidia' : 'cpu';
}

/**
 * Run Docker Compose for one stack in its own project, apart from the production API.
 *
 * Every stack shares the project, so switching hardware keeps accounts and data.
 *
 * Args:
 *   stack: Stack from `stacks`.
 *   args: Compose subcommand and its arguments.
 * Returns: Nothing when Compose succeeds.
 * Raises: Error when Compose fails.
 */
function stackCompose(stack, args) {
  // Stack model defaults first so the operator's own .env and shell override them.
  const envFiles = ['--env-file', path.join(root, 'deploy', `${stack}.env`)];
  if (fs.existsSync(path.join(root, '.env'))) envFiles.push('--env-file', path.join(root, '.env'));
  // Cloud inference needs no local services, so it skips the shared local overlay.
  const overlays = stack === 'cloud' ? [] : ['deploy/compose.local.yaml'];
  const files = ['compose.yaml', ...overlays, `deploy/compose.${stack}.yaml`]
    .flatMap((file) => ['-f', path.join(root, file)]);
  const result = spawnSync('docker', ['compose', '-p', 'whisperer-stack', ...envFiles, ...files, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      // An operator-run Ollama (OLLAMA_BASE_URL) replaces the bundled container.
      COMPOSE_PROFILES: process.env.OLLAMA_BASE_URL ? '' : 'bundled-ollama',
      // Only `up` hands the key to containers; other subcommands just need interpolation to succeed.
      ...(args[0] !== 'up' && !process.env.GATEWAY_API_KEY ? { GATEWAY_API_KEY: 'sk-unused' } : {}),
    },
  });
  if (result.error) throw new Error(`could not start docker: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`docker compose failed for the ${stack} stack`);
}

/**
 * Print command documentation without starting application or packaging processes.
 *
 * Args: None.
 * Returns: Nothing after printing every supported command.
 */
function help() {
  console.log('Usage: make <target>');
  console.log('');
  for (const [command, description] of Object.entries(descriptions)) {
    console.log(`  ${command.padEnd(14)} ${description}`);
  }
}

const command = process.argv[2] ?? 'help';

try {
  if (command !== 'help') requireSupportedNode();
  switch (command) {
    case 'help': help(); break;
    case 'setup': setup(); break;
    case 'desktop-build': desktopBuild(); break;
    case 'desktop-test': npm(['run', 'desktop:test']); break;
    case 'desktop-lint': npm(['run', 'desktop:typecheck']); npm(['run', 'desktop:lint']); break;
    case 'linux': desktopBuild(); npm(['run', 'dist:linux']); break;
    case 'desktop': desktopBuild(); npm(['run', 'desktop']); break;
    case 'server': npm(['run', 'server']); break;
    case 'windows': windows(); break;
    case 'dmg': dmg(); break;
    case 'macos-zip': desktopBuild(); npm(['run', 'dist:macos:zip']); break;
    case 'brand-setup': brandSetup(); break;
    case 'brand': regenerateBrand(); break;
    case 'docs-check': run(process.execPath, [path.join(tools, 'check-folder-docs.mjs')]); break;
    case 'api-setup': apiSetup(); break;
    case 'api-test': apiSetup(); run('uv', ['run', '--locked', '--all-packages', 'pytest']); break;
    case 'api-lint': apiLint(); break;
    case 'api-contract': apiContract(); break;
    case 'api-preflight': apiPreflight(); break;
    case 'api-build': run('docker', ['build', '-t', 'whisperer-api:0.1.0', root]); break;
    case 'api-up': {
      run('docker', ['compose', 'up', '--build', '--detach', '--wait', '--wait-timeout', '120']);
      break;
    }
    case 'api-down': run('docker', ['compose', 'down']); break;
    case 'api-status': run('docker', ['compose', 'ps']); break;
    case 'api-logs': run('docker', ['compose', 'logs', '--tail', '100', 'api']); break;
    case 'stack-up': {
      const stack = selectedStack();
      // Compose evaluates a nested ${VAR:?} even when the outer default is set, so check the key here.
      if (stack === 'cloud' && !process.env.GATEWAY_API_KEY && !process.env.OPENAI_API_KEY && !envFileDefines('GATEWAY_API_KEY', 'OPENAI_API_KEY')) {
        throw new Error('the cloud stack needs OPENAI_API_KEY or GATEWAY_API_KEY in the environment or .env.');
      }
      console.log(`Starting the ${stack} stack.`);
      // First start of a local stack downloads models, so allow far longer than the API alone.
      stackCompose(stack, ['up', '--build', '--detach', '--remove-orphans', '--wait', '--wait-timeout', '3600']);
      break;
    }
    // --remove-orphans also stops services of a different stack started earlier.
    case 'stack-down': stackCompose(selectedStack(), ['down', '--remove-orphans']); break;
    case 'stack-status': stackCompose(selectedStack(), ['ps', '--all']); break;
    case 'stack-config': for (const stack of stacks) stackCompose(stack, ['config', '--quiet']); break;
    default: throw new Error(`unknown command: ${command}. Run make help.`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
