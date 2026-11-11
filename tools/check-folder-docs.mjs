#!/usr/bin/env node
/**
 * Fail when a tracked folder lacks its AGENTS.md or exact CLAUDE.md shim, or when an existing
 * README.md lacks its Mermaid diagram or a link to a child folder's README.md.
 *
 * The tree comes from the git index, so untracked scratch directories never count. Every folder
 * holding tracked files, and each of its ancestors, needs AGENTS.md and CLAUDE.md. CLAUDE.md is
 * exactly the shim that points Claude Code at AGENTS.md, because Claude loads nested CLAUDE.md
 * files only. A README.md is optional; where one exists it carries a Mermaid diagram and links the
 * README.md of every direct child folder that has one.
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
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    if (!files.has(within(folder, name))) failures.push(`no ${name}`);
  }
  if (files.has(within(folder, 'CLAUDE.md')) && staged(within(folder, 'CLAUDE.md')).trim() !== CLAUDE_SHIM) {
    failures.push('CLAUDE.md is not exactly the AGENTS.md shim');
  }
  if (folder !== '.' && files.has(within(folder, 'AGENTS.md')) && !staged(within(folder, 'AGENTS.md')).includes('(../AGENTS.md)')) {
    failures.push('AGENTS.md does not link its parent AGENTS.md');
  }
  if (!files.has(within(folder, 'README.md'))) return failures;
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
  console.error('Every tracked folder needs AGENTS.md and the CLAUDE.md shim; an existing README.md needs a Mermaid diagram and child README links.');
  for (const line of report) console.error(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log(`Folder documentation covers ${required.length} folders.`);
}
