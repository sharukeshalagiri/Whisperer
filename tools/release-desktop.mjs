#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
/** Build one committed desktop revision on Linux, Windows-in-Docker, and macOS. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseAssetName, parseVersion, releaseTag } from '../src/desktop/shared/releases.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(root, 'tools');
const platforms = ['linux', 'windows', 'macos'];
const installerPattern = /\.(deb|dmg|exe)$/i;
// macOS builds run over SSH on a host the operator names; nothing about that host is assumed here.
const macEnvironment = {
  host: 'WHISPERER_MAC_HOST',
  buildRoot: 'WHISPERER_MAC_BUILD_ROOT',
  nodePath: 'WHISPERER_MAC_NODE_PATH',
};

/**
 * Locate the optional per-user release config, which lives outside every checkout.
 *
 * Args: None.
 * Returns: `%APPDATA%\whisperer\release.json` on Windows, otherwise `$XDG_CONFIG_HOME/whisperer/release.json`
 *   or `~/.config/whisperer/release.json`.
 */
function userReleaseConfigPath() {
  if (process.platform === 'win32' && process.env.APPDATA) return path.join(process.env.APPDATA, 'whisperer', 'release.json');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'whisperer', 'release.json');
}

/**
 * Read optional macOS build defaults from the per-user release config.
 *
 * Args:
 *   file: Config path; a missing file means no defaults.
 * Returns: `{ macHost, macBuildRoot, macNodePath }`, each a string or null.
 * Raises: Error when the file exists but is not a JSON object of optional strings.
 */
function readUserReleaseConfig(file = userReleaseConfigPath()) {
  if (!fs.existsSync(file)) return { macHost: null, macBuildRoot: null, macNodePath: null };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Release config ${file} is not valid JSON: ${error.message}`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Release config ${file} must be a JSON object.`);
  const known = ['macHost', 'macBuildRoot', 'macNodePath'];
  const unknown = Object.keys(config).filter((key) => !known.includes(key));
  if (unknown.length) throw new Error(`Release config ${file} has unknown keys: ${unknown.join(', ')}.`);
  const result = {};
  for (const key of known) {
    if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error(`Release config ${file}: ${key} must be a string.`);
    result[key] = config[key] || null;
  }
  return result;
}

/**
 * Parse the deliberately small release command-line interface.
 *
 * Args:
 *   arguments_: Values supplied after the script name.
 *   defaults: macOS defaults from the per-user release config.
 * Returns: Normalized release options before the commit and output path are resolved.
 * Raises: Error when an option is missing, unknown, or invalid.
 */
function parseArguments(arguments_, defaults = readUserReleaseConfig()) {
  // Precedence: command-line option, then environment variable, then the per-user release config.
  const options = {
    commit: 'HEAD',
    dist: null,
    macHost: process.env[macEnvironment.host] || defaults.macHost,
    macBuildRoot: process.env[macEnvironment.buildRoot] || defaults.macBuildRoot,
    macNodePath: process.env[macEnvironment.nodePath] || defaults.macNodePath,
    requestedPlatforms: [...platforms],
    dryRun: false,
    keepWorkspaces: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (argument === '--keep-workspaces') {
      options.keepWorkspaces = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    index += 1;
    switch (argument) {
      case '--commit': options.commit = value; break;
      case '--dist': options.dist = value; break;
      case '--mac-host': options.macHost = value; break;
      case '--mac-build-root': options.macBuildRoot = value; break;
      case '--mac-node-path': options.macNodePath = value; break;
      case '--platform': options.requestedPlatforms = value.split(',').filter(Boolean); break;
      default: throw new Error(`Unknown option: ${argument}.`);
    }
  }
  if (options.requestedPlatforms.length === 0 || options.requestedPlatforms.some((platform) => !platforms.includes(platform))) {
    throw new Error(`--platform must name one or more of: ${platforms.join(', ')}.`);
  }
  options.requestedPlatforms = [...new Set(options.requestedPlatforms)];
  return options;
}

/**
 * Format a command for an operator-facing dry-run log.
 *
 * Args:
 *   program: Executable name or path.
 *   arguments_: Literal argument vector for the executable.
 * Returns: A shell-readable display string only; it is never executed by a shell.
 */
function displayCommand(program, arguments_) {
  return [program, ...arguments_].map((value) => JSON.stringify(value)).join(' ');
}

/**
 * Start a local program with literal arguments and fail on an unsuccessful exit.
 *
 * Args:
 *   program: Executable to launch.
 *   arguments_: Literal argument vector for the executable.
 *   options: Working directory, optional captured output, and dry-run state.
 * Returns: Captured standard output when requested, otherwise an empty string.
 * Raises: Error when the program cannot start or exits unsuccessfully.
 */
function run(program, arguments_, options = {}) {
  console.log(`$ ${displayCommand(program, arguments_)}`);
  if (options.dryRun) return '';
  const result = spawnSync(program, arguments_, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw new Error(`Could not start ${program}: ${result.error.message}`);
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr ?? '');
      process.stdout.write(result.stdout ?? '');
    }
    const detail = result.signal ? `signal ${result.signal}` : `exit status ${result.status}`;
    throw new Error(`${program} failed with ${detail}.`);
  }
  return options.capture ? result.stdout : '';
}

/**
 * Resolve a commit expression to a full committed SHA.
 *
 * Args:
 *   expression: Git revision supplied by the operator.
 *   dryRun: Whether command execution is disabled.
 * Returns: The full commit SHA, or a dry-run placeholder.
 * Raises: Error when the revision does not resolve to a commit.
 */
function resolveCommit(expression, dryRun) {
  if (dryRun) return expression === 'HEAD' ? 'DRY-RUN' : expression;
  return run('git', ['rev-parse', '--verify', `${expression}^{commit}`], { capture: true }).trim();
}

/**
 * Read the release version of a commit and require it to follow the naming scheme.
 *
 * Args:
 *   commit: Full commit SHA being released.
 *   dryRun: Whether command execution is disabled.
 * Returns: The semantic version from that commit's package.json.
 * Raises: Error when the version is not a semantic version.
 */
function releaseVersion(commit, dryRun) {
  const source = dryRun ? fs.readFileSync(path.join(root, 'package.json'), 'utf8') : run('git', ['show', `${commit}:package.json`], { capture: true });
  const { version } = JSON.parse(source);
  if (!parseVersion(version)) throw new Error(`package.json version ${JSON.stringify(version)} is not a semantic version. See docs/desktop-release.md.`);
  return version;
}

/**
 * Ensure a local path can be used as a release output directory.
 *
 * Args:
 *   value: Path supplied by the operator or calculated by the script.
 * Returns: The normalized absolute path.
 * Raises: Error when the path is empty.
 */
function localDirectory(value) {
  if (!value) throw new Error('A release output directory is required.');
  const directory = path.resolve(value);
  const relative = path.relative(root, directory);
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative !== 'dist' && !relative.startsWith(`dist${path.sep}`)) {
    throw new Error('Release output must be outside this checkout or under its ignored dist/ directory.');
  }
  return directory;
}

/**
 * Validate an SSH host alias without accepting shell metacharacters.
 *
 * Args:
 *   host: SSH host alias supplied by the operator.
 * Returns: The validated host alias.
 * Raises: Error when the alias contains unsafe characters.
 */
function sshHost(host) {
  if (!/^[A-Za-z0-9_.-]+$/.test(host)) throw new Error('--mac-host may contain only letters, numbers, dots, underscores, and hyphens.');
  return host;
}

/**
 * Validate the fixed macOS workspace parent path.
 *
 * Args:
 *   directory: Remote absolute directory supplied by the operator.
 * Returns: The validated remote directory.
 * Raises: Error when the directory is not a simple absolute POSIX path.
 */
function remoteDirectory(directory) {
  if (!/^\/[A-Za-z0-9_./-]+$/.test(directory) || directory.includes('//') || directory.includes('/../')) {
    throw new Error('--mac-build-root must be an absolute path using only letters, numbers, dot, slash, underscore, and hyphen.');
  }
  return directory.replace(/\/$/, '');
}

/**
 * Quote one value for the POSIX shell used only by ssh on the trusted build host.
 *
 * Args:
 *   value: Literal value to embed in a remote command.
 * Returns: Single-quoted POSIX shell text.
 */
function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

/**
 * Build a source archive of one commit, which by construction leaves out untracked local data.
 *
 * Args:
 *   commit: Full committed SHA to archive.
 *   workspace: Temporary local release workspace.
 *   dryRun: Whether command execution is disabled.
 * Returns: Absolute archive path.
 * Raises: Error when Git or tar cannot create a usable committed archive.
 */
function createSourceArchive(commit, workspace, dryRun) {
  const archive = path.join(workspace, `whisperer-${commit}.tar`);
  if (dryRun) {
    console.log(`$ git archive ${commit} > ${archive}`);
    return archive;
  }
  fs.mkdirSync(workspace, { recursive: true });
  const result = spawnSync('git', ['archive', '--format=tar', '--output', archive, commit], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git archive failed: ${result.error?.message ?? result.stderr ?? `exit status ${result.status}`}`);
  }
  return archive;
}

/**
 * Extract the committed source archive into a fresh build workspace.
 *
 * Args:
 *   archive: Committed source archive to extract.
 *   destination: Empty local source workspace.
 *   commit: Full commit SHA recorded beside the source tree.
 *   dryRun: Whether command execution is disabled.
 * Returns: Nothing after extraction succeeds.
 * Raises: Error when extraction fails.
 */
function extractSourceArchive(archive, destination, commit, dryRun) {
  if (dryRun) {
    console.log(`$ tar -xf ${JSON.stringify(archive)} -C ${JSON.stringify(destination)}`);
    return;
  }
  fs.mkdirSync(destination, { recursive: true });
  run('tar', ['-xf', archive, '-C', destination]);
  fs.writeFileSync(path.join(destination, '.release-commit'), `${commit}\n`);
}

/**
 * Run the reusable desktop validation sequence before packaging on a capable host.
 *
 * Args:
 *   source: Fresh committed source workspace.
 *   useXvfb: Whether Electron acceptance requires a virtual Linux display.
 *   dryRun: Whether command execution is disabled.
 * Returns: Named completed validation steps.
 * Raises: Error when any validation cannot complete.
 */
function validateDesktop(source, useXvfb, dryRun) {
  const commandTool = path.join(source, 'tools', 'commands.mjs');
  const acceptanceTool = path.join(source, 'tools', 'drive-desktop.mjs');
  const completed = [];
  run(process.execPath, [commandTool, 'setup'], { cwd: source, dryRun });
  completed.push('setup');
  run(process.execPath, [commandTool, 'desktop-lint'], { cwd: source, dryRun });
  completed.push('desktop-lint');
  run(process.execPath, [commandTool, 'desktop-test'], { cwd: source, dryRun });
  completed.push('desktop-test');
  const acceptance = useXvfb
    ? ['xvfb-run', ['-a', process.execPath, acceptanceTool]]
    : [process.execPath, [acceptanceTool]];
  run(acceptance[0], acceptance[1], { cwd: source, dryRun });
  completed.push('desktop-acceptance-loopback-fixture');
  return completed;
}

/**
 * Locate installer files produced by electron-builder without retaining unpacked applications.
 *
 * Args:
 *   directory: Package output directory to inspect.
 *   extension: Required installer file extension including its dot.
 * Returns: Sorted absolute installer paths.
 * Raises: Error when no matching installer exists.
 */
function installers(directory, extension) {
  const found = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) found.push(candidate);
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  if (found.length === 0) throw new Error(`No ${extension} installer was produced in ${directory}.`);
  return found.sort();
}

/**
 * Copy completed installers into the ignored release output directory.
 *
 * Args:
 *   files: Installer paths to collect.
 *   destination: Platform-specific output directory.
 *   dryRun: Whether command execution is disabled.
 * Returns: Relative artifact paths in the release output directory.
 * Raises: Error when two installers have the same output name.
 */
function collectInstallers(files, destination, dryRun) {
  const names = new Set();
  const copied = [];
  for (const file of files) {
    const name = path.basename(file);
    // The desktop updater recognizes only this scheme; an unnamed installer would never be offered.
    if (!parseAssetName(name)) throw new Error(`Installer ${name} does not follow Whisperer-<version>-<os>-<arch>.<ext>.`);
    if (names.has(name)) throw new Error(`Two installers share the name ${name}.`);
    names.add(name);
    const output = path.join(destination, name);
    console.log(`$ copy ${JSON.stringify(file)} ${JSON.stringify(output)}`);
    if (!dryRun) {
      fs.mkdirSync(destination, { recursive: true });
      fs.copyFileSync(file, output);
    }
    copied.push(output);
  }
  return copied;
}

/**
 * Build and verify Linux and Windows artifacts from a single local source workspace.
 *
 * Args:
 *   platform: Linux or Windows packaging target.
 *   source: Fresh committed source workspace.
 *   output: Release output directory.
 *   dryRun: Whether command execution is disabled.
 * Returns: Completed checks and collected artifacts for the platform.
 * Raises: Error when packaging or packaged executable verification fails.
 */
function buildLocalPlatform(platform, source, output, dryRun) {
  const commandTool = path.join(source, 'tools', 'commands.mjs');
  const checks = validateDesktop(source, true, dryRun);
  if (platform === 'linux') {
    run(process.execPath, [commandTool, 'linux'], { cwd: source, dryRun });
    checks.push('linux-package-brand-and-independence-check');
    const executable = path.join(source, 'dist', 'linux-unpacked', 'whisperer');
    run('xvfb-run', ['-a', process.execPath, path.join(source, 'tools', 'drive-packaged.mjs'), executable], { cwd: source, dryRun });
    checks.push('packaged-linux-cdp-sign-in');
    const artifacts = dryRun ? [] : collectInstallers(installers(path.join(source, 'dist'), '.deb'), path.join(output, 'linux'), false);
    return { checks, artifacts };
  }
  run(process.execPath, [commandTool, 'windows'], { cwd: source, dryRun });
  checks.push('windows-package-brand-and-independence-check');
  let setupInstallers = [];
  if (!dryRun) {
    setupInstallers = installers(path.join(source, 'dist'), '.exe').filter((file) => parseAssetName(path.basename(file))?.os === 'win');
    if (setupInstallers.length === 0) throw new Error('Windows packaging produced no NSIS setup executable.');
  }
  const artifacts = dryRun ? [] : collectInstallers(setupInstallers, path.join(output, 'windows'), false);
  return { checks, artifacts };
}

/**
 * Run a literal remote command through the SSH configuration alias.
 *
 * Args:
 *   host: Validated SSH host alias.
 *   command: Fully quoted remote POSIX shell command.
 *   options: Capture and dry-run settings.
 * Returns: Captured standard output when requested.
 * Raises: Error when the remote command fails.
 */
function remote(host, command, options = {}) {
  return run('ssh', [host, command], options);
}

/**
 * Require a remote file path returned by a trusted build host to stay in its workspace.
 *
 * Args:
 *   candidate: One remote path returned by find.
 *   workspace: Remote workspace generated by this script.
 *   extension: Expected lowercase filename suffix.
 * Returns: The validated remote path.
 * Raises: Error when the remote result is outside the workspace or unexpected.
 */
function remoteArtifact(candidate, workspace, extension) {
  if (!candidate.startsWith(`${workspace}/dist/`) || !candidate.endsWith(extension) || !/^[A-Za-z0-9_./-]+$/.test(candidate)) {
    throw new Error(`Unexpected remote artifact path: ${candidate}`);
  }
  return candidate;
}

/**
 * Build macOS artifacts in the configured graphical macOS VM and collect the DMGs.
 *
 * Args:
 *   archive: Local committed source archive.
 *   commit: Full commit SHA built on every host.
 *   output: Release output directory.
 *   options: Validated host, workspace parent, dry-run state, and fresh workspace token.
 * Returns: Completed checks and collected artifacts for macOS.
 * Raises: Error when SSH, remote validation, packaging, or collection fails.
 */
function buildMacos(archive, commit, output, options) {
  const host = sshHost(options.macHost);
  const buildRoot = remoteDirectory(options.macBuildRoot);
  const token = `${commit.slice(0, 12)}-${Date.now()}`;
  const workspace = `${buildRoot}/whisperer-${token}`;
  const remoteArchive = `${buildRoot}/whisperer-${token}.tar`;
  const quotedWorkspace = shellQuote(workspace);
  const quotedArchive = shellQuote(remoteArchive);
  const checks = [];

  // The command only creates a new, unique workspace; it intentionally never removes remote files.
  remote(host, `mkdir -p ${shellQuote(buildRoot)} && mkdir -p ${quotedWorkspace}`, options);
  run('scp', [archive, `${host}:${remoteArchive}`], options);
  remote(host, `tar -xf ${quotedArchive} -C ${quotedWorkspace} && printf '%s\\n' ${shellQuote(commit)} > ${quotedWorkspace}/.release-commit`, options);

  // Noninteractive SSH may not inherit the macOS user's Node installation path; --mac-node-path prepends it.
  const remoteEnvironment = options.macNodePath ? `PATH=${shellQuote(options.macNodePath)}:$PATH; export PATH;` : '';
  const remoteNode = 'node';
  const commands = [
    [remoteNode, ['tools/commands.mjs', 'setup'], 'setup'],
    [remoteNode, ['tools/commands.mjs', 'desktop-lint'], 'desktop-lint'],
    [remoteNode, ['tools/commands.mjs', 'desktop-test'], 'desktop-test'],
    [remoteNode, ['tools/drive-desktop.mjs'], 'desktop-acceptance-loopback-fixture'],
    [remoteNode, ['tools/commands.mjs', 'dmg'], 'macos-dmg-package'],
  ];
  for (const [program, arguments_, label] of commands) {
    const remoteCommand = `${remoteEnvironment} cd ${quotedWorkspace} && ${[program, ...arguments_].map(shellQuote).join(' ')}`;
    remote(host, remoteCommand, options);
    checks.push(label);
  }
  const appPaths = remote(host, `find ${shellQuote(`${workspace}/dist`)} -type f -path '*/Contents/MacOS/whisperer' -print`, { ...options, capture: true })
    .split('\n').map((value) => value.trim()).filter(Boolean);
  if (!options.dryRun && appPaths.length !== 2) throw new Error(`Expected two macOS packaged executables, found ${appPaths.length}.`);
  const architecture = remote(host, 'uname -m', { ...options, capture: true }).trim();
  const nativeApp = architecture === 'x86_64'
    ? appPaths.find((candidate) => candidate.includes('/dist/mac/'))
    : architecture === 'arm64'
      ? appPaths.find((candidate) => candidate.includes('/dist/mac-arm64/'))
      : null;
  if (!options.dryRun && !nativeApp) throw new Error(`No macOS packaged executable matches remote architecture ${architecture}.`);
  if (nativeApp) {
    const safeExecutable = remoteArtifact(nativeApp, workspace, 'whisperer');
    remote(host, `${remoteEnvironment} cd ${quotedWorkspace} && ${[remoteNode, 'tools/drive-packaged.mjs', safeExecutable].map(shellQuote).join(' ')}`, options);
  }
  checks.push(`packaged-macos-cdp-sign-in-${architecture || 'host-architecture'}`);

  const remoteDmgPaths = remote(host, `find ${shellQuote(`${workspace}/dist`)} -maxdepth 1 -type f -name '*.dmg' -print`, { ...options, capture: true })
    .split('\n').map((value) => value.trim()).filter(Boolean)
    .map((value) => remoteArtifact(value, workspace, '.dmg'));
  if (!options.dryRun && remoteDmgPaths.length !== 2) throw new Error(`Expected two macOS DMGs, found ${remoteDmgPaths.length}.`);
  const localPaths = [];
  if (!options.dryRun) fs.mkdirSync(path.join(output, 'macos'), { recursive: true });
  for (const remotePath of remoteDmgPaths) {
    if (!parseAssetName(path.basename(remotePath))) throw new Error(`Installer ${path.basename(remotePath)} does not follow Whisperer-<version>-<os>-<arch>.<ext>.`);
    const destination = path.join(output, 'macos', path.basename(remotePath));
    run('scp', [`${host}:${remotePath}`, destination], options);
    localPaths.push(destination);
  }
  return { checks, artifacts: localPaths };
}

/**
 * Calculate SHA-256 metadata for every installer retained in the release output.
 *
 * Args:
 *   output: Release output directory.
 * Returns: Sorted artifact records containing relative path, platform, byte count, and digest.
 */
function checksumArtifacts(output) {
  if (!fs.existsSync(output)) return [];
  const artifacts = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && installerPattern.test(entry.name)) {
        const relative = path.relative(output, file);
        artifacts.push({
          path: relative,
          platform: relative.split(path.sep)[0],
          bytes: fs.statSync(file).size,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        });
      }
    }
  };
  visit(output);
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Load compatible results from an earlier single-platform resume.
 *
 * Args:
 *   manifestPath: Existing manifest location.
 *   commit: Full commit SHA requested now.
 * Returns: Prior platform results or an empty object.
 */
function resumedPlatforms(manifestPath, commit) {
  if (!fs.existsSync(manifestPath)) return {};
  try {
    const prior = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return prior.commit === commit && prior.platforms && typeof prior.platforms === 'object' ? prior.platforms : {};
  } catch {
    return {};
  }
}

/**
 * Reject an output directory that could mix installers from different commits.
 *
 * Args:
 *   output: Release output directory to inspect.
 *   manifestPath: Expected manifest location in the output directory.
 *   commit: Full commit SHA requested by this invocation.
 *   dryRun: Whether command execution is disabled.
 * Returns: Nothing when the output is new or already belongs to this commit.
 * Raises: Error when retained installers or a manifest belong to another commit.
 */
function requireCompatibleOutput(output, manifestPath, commit, dryRun) {
  if (dryRun || !fs.existsSync(output)) return;
  if (fs.existsSync(manifestPath)) {
    try {
      const prior = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (prior.commit === commit) return;
      throw new Error(`Release output already contains a manifest for ${prior.commit ?? 'an unknown commit'}. Choose a different --dist directory.`);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('Release output has an unreadable manifest. Choose a different --dist directory.');
      throw error;
    }
  }
  if (checksumArtifacts(output).length > 0) {
    throw new Error('Release output already contains installers without a manifest. Choose a new --dist directory.');
  }
}

/**
 * Persist result state and content checksums without claiming omitted checks passed.
 *
 * Args:
 *   manifestPath: Output manifest path.
 *   commit: Full committed SHA built by this invocation.
 *   version: Semantic version the installers carry.
 *   output: Release output directory.
 *   results: Per-platform states accumulated so far.
 *   dryRun: Whether the release was only displayed.
 * Returns: Nothing after JSON and checksum files are written.
 */
function writeManifest(manifestPath, commit, version, output, results, dryRun) {
  if (dryRun) return;
  const artifacts = checksumArtifacts(output);
  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    commit,
    version,
    tag: releaseTag(version),
    dryRun: false,
    platforms: results,
    artifacts,
    verificationLimitations: {
      linux: 'Launches the unpacked Linux executable over CDP. It does not install the .deb on a clean system.',
      windows: 'Builds through the pinned Docker Wine toolchain and verifies packaged ASAR branding and independence. It does not launch the installer or executable on Windows.',
      macos: 'Runs loopback-fixture acceptance and launches only the executable matching the macOS VM architecture over CDP. Both architectures receive packaged ASAR branding and independence checks. It does not install, sign, notarize, or staple either DMG.',
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const checksums = artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).join('\n');
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), checksums ? `${checksums}\n` : '');
}

/**
 * Print command help without changing a checkout or build host.
 *
 * Args: None.
 * Returns: Nothing after usage is printed.
 */
function help() {
  console.log(`Usage: node tools/release-desktop.mjs [options]\n\nBuilds one committed revision on Linux, Windows-in-Docker, and macOS.\n\nOptions:\n  --commit <sha>             Commit to archive; defaults to HEAD.\n  --platform <list>          Comma-separated linux,windows,macos; defaults to all.\n  --dist <directory>         Ignored output directory; defaults to dist/release-<sha>.\n  --mac-host <ssh-alias>     macOS SSH host or alias, or set ${macEnvironment.host}. Required for macos.\n  --mac-build-root <path>    Absolute parent for new macOS workspaces, or set ${macEnvironment.buildRoot}. Required for macos.\n  --mac-node-path <dir>      Directory prepended to PATH on the macOS host, or set ${macEnvironment.nodePath}.\n  --dry-run                  Print local and remote commands without running them.\n  --keep-workspaces          Keep the local temporary committed-source workspace.\n  --help                     Show this help.\n\nmacOS defaults can also come from ${userReleaseConfigPath()}: a JSON object with\noptional macHost, macBuildRoot and macNodePath strings. Options and environment variables win.\n\nThe script never commits, pushes, publishes, deploys, or removes remote files.`);
}

/**
 * Execute the requested build order and retain an honest resumable manifest on failure.
 *
 * Args: None.
 * Returns: Nothing after all requested platforms build successfully.
 * Raises: Error after recording the failed platform and unrun platforms in the manifest.
 */
function main() {
  if (process.argv.includes('--help')) {
    help();
    return;
  }
  const options = parseArguments(process.argv.slice(2));
  if (options.requestedPlatforms.includes('macos')) {
    if (!options.macHost) throw new Error(`macOS builds need --mac-host <ssh-alias>, ${macEnvironment.host} or macHost in ${userReleaseConfigPath()}.`);
    if (!options.macBuildRoot) throw new Error(`macOS builds need --mac-build-root <absolute-path>, ${macEnvironment.buildRoot} or macBuildRoot in ${userReleaseConfigPath()}.`);
    options.macHost = sshHost(options.macHost);
    options.macBuildRoot = remoteDirectory(options.macBuildRoot);
    if (options.macNodePath) options.macNodePath = remoteDirectory(options.macNodePath);
  }
  const commit = resolveCommit(options.commit, options.dryRun);
  const version = releaseVersion(commit, options.dryRun);
  const output = localDirectory(options.dist ?? path.join(root, 'dist', `release-${commit.slice(0, 12)}`));
  const manifestPath = path.join(output, 'manifest.json');
  requireCompatibleOutput(output, manifestPath, commit, options.dryRun);
  const workspace = path.join(os.tmpdir(), `whisperer-release-${commit.slice(0, 12)}-${process.pid}`);
  const results = resumedPlatforms(manifestPath, commit);
  const startedAt = new Date().toISOString();
  console.log(`Release commit: ${commit}`);
  console.log(`Release version: ${version} (tag ${releaseTag(version)})`);
  console.log(`Installer output: ${output}`);
  console.log(`Build order: ${options.requestedPlatforms.join(' → ')}`);

  try {
    if (!options.dryRun) fs.mkdirSync(output, { recursive: true });
    const archive = createSourceArchive(commit, workspace, options.dryRun);
    for (const platform of options.requestedPlatforms) {
      results[platform] = { status: 'running', startedAt, checks: [], artifacts: [] };
      writeManifest(manifestPath, commit, version, output, results, options.dryRun);
      if (platform === 'macos') {
        const details = buildMacos(archive, commit, output, options);
        results[platform] = { status: 'passed', startedAt, ...details, completedAt: new Date().toISOString() };
      } else {
        const source = path.join(workspace, platform);
        extractSourceArchive(archive, source, commit, options.dryRun);
        const details = buildLocalPlatform(platform, source, output, options.dryRun);
        results[platform] = { status: 'passed', startedAt, ...details, completedAt: new Date().toISOString() };
      }
      writeManifest(manifestPath, commit, version, output, results, options.dryRun);
    }
    console.log(options.dryRun ? 'Dry run complete: no source, installer, or manifest was created.' : `Release build passed. Installers, SHA256SUMS, and manifest: ${output}`);
  } catch (error) {
    const current = options.requestedPlatforms.find((platform) => results[platform]?.status === 'running');
    if (current) results[current] = { ...results[current], status: 'failed', completedAt: new Date().toISOString(), error: error.message };
    writeManifest(manifestPath, commit, version, output, results, options.dryRun);
    throw error;
  } finally {
    if (!options.dryRun && !options.keepWorkspaces) fs.rmSync(workspace, { recursive: true, force: true });
    if (!options.dryRun && options.keepWorkspaces) console.log(`Kept local committed-source workspace: ${workspace}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`Release build failed: ${error.message}`);
  process.exitCode = 1;
}
