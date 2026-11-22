#!/usr/bin/env node
/**
 * Check the folder guides and READMEs.
 *
 * The tree comes from the git index, so untracked scratch directories never count. The root needs
 * AGENTS.md. Any other folder may have one, when it has rules of its own; it must then link the
 * nearest ancestor's AGENTS.md. AGENTS.md and CLAUDE.md come in pairs, and CLAUDE.md is exactly
 * the shim that points Claude Code at AGENTS.md, because Claude loads nested CLAUDE.md files only.
 * A README.md is optional; where one exists it carries a Mermaid diagram and links the README.md
 * of every direct child folder that has one. The root README.md is the product page and is exempt:
 * the architecture diagram and the component READMEs are reached from docs/README.md.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const CLAUDE_SHIM = [
  'This is a shim file for Claude agents.',
  '',
  'Read and follow [@AGENTS.md](./AGENTS.md) in this directory as the source of truth for project instructions.',
].join('\n');

/**
 * Join a folder and file name the way git lists tracked paths.
 *
 * Args:
 *   folder: Folder path, `.` for the root.
 *   name: File name inside the folder.
 * Returns:
 *   Repository relative file path.
 */
function within(folder, name) {
  return folder === '.' ? name : `${folder}/${name}`;
}

/**
 * Read a file as staged in the git index.
 *
 * Args:
 *   file: Repository relative file path known to be tracked.
 * Returns:
 *   The staged file text with CRLF line endings normalized.
 */
function staged(file) {
  return execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replace(/\r\n/g, '\n');
}

/**
 * Relative link from a folder to the nearest ancestor folder that has an AGENTS.md.
 *
 * Args:
 *   folder: Tracked folder path other than the root.
 *   files: Every tracked file path.
 * Returns:
 *   A path such as `../AGENTS.md` or `../../AGENTS.md`.
 */
function nearestGuideLink(folder, files) {
  let up = 1;
  let parent = path.posix.dirname(folder);
  while (parent !== '.' && !files.has(within(parent, 'AGENTS.md'))) {
    parent = path.posix.dirname(parent);
    up += 1;
  }
  return `${'../'.repeat(up)}AGENTS.md`;
}

/**
 * List every documentation problem for one folder.
 *
 * Args:
 *   folder: Tracked folder path.
 *   files: Every tracked file path.
 *   children: Tracked folders directly below this one.
 * Returns:
 *   Failure descriptions; empty when the folder passes.
 */
function folderFailures(folder, files, children) {
  const failures = [];
  const hasAgents = files.has(within(folder, 'AGENTS.md'));
  const hasClaude = files.has(within(folder, 'CLAUDE.md'));
  if (folder === '.' && !hasAgents) failures.push('no AGENTS.md');
  if (hasAgents && !hasClaude) failures.push('AGENTS.md without the CLAUDE.md shim');
  if (hasClaude && !hasAgents) failures.push('CLAUDE.md without an AGENTS.md');
  if (hasClaude && staged(within(folder, 'CLAUDE.md')).trim() !== CLAUDE_SHIM) {
    failures.push('CLAUDE.md is not exactly the AGENTS.md shim');
  }
  if (folder !== '.' && hasAgents) {
    const link = nearestGuideLink(folder, files);
    if (!staged(within(folder, 'AGENTS.md')).includes(`(${link})`)) {
      failures.push(`AGENTS.md does not link the nearest ancestor guide (${link})`);
    }
  }
  if (folder === '.' || !files.has(within(folder, 'README.md'))) return failures;
  const readme = staged(within(folder, 'README.md'));
  if (!/```mermaid\s*\n[\s\S]+?\n```/.test(readme)) failures.push('README.md has no Mermaid diagram');
  for (const child of children) {
    if (!files.has(within(child, 'README.md'))) continue;
    const name = path.posix.basename(child);
    if (!readme.includes(`(${name}/README.md)`) && !readme.includes(`(./${name}/README.md)`)) {
      failures.push(`README.md does not link ${name}/README.md`);
    }
  }
  return failures;
}

const files = new Set(execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean));
const folders = new Set(['.']);
for (const file of files) {
  for (let folder = path.posix.dirname(file); folder !== '.'; folder = path.posix.dirname(folder)) folders.add(folder);
}
const required = [...folders].sort();
const report = [];
for (const folder of required) {
  const children = required.filter((other) => other !== '.' && path.posix.dirname(other) === folder);
  const failures = folderFailures(folder, files, children);
  if (failures.length) report.push(`${folder}: ${failures.join(', ')}`);
}

if (report.length) {
  console.error('Folder guides: the root needs AGENTS.md, each AGENTS.md needs the CLAUDE.md shim and a link to the nearest ancestor guide; an existing README.md needs a Mermaid diagram and child README links.');
  for (const line of report) console.error(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log(`Folder documentation checked in ${required.length} folders.`);
}
