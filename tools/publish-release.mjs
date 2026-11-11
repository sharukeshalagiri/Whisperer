#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
/** Publish one verified release-desktop output to the release feed named in src/desktop/shared/releases.ts. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { RELEASE_FEED, parseAssetName, parseVersion, releaseApi, releaseTag } from '../src/desktop/shared/releases.ts';

/**
 * Print usage without contacting the forge.
 *
 * Args: None.
 * Returns: Nothing after usage is printed.
 */
function help() {
  console.log(`Usage: RELEASE_TOKEN=<token> node tools/publish-release.mjs <release-output> [--notes <file>] [--dry-run]

Creates release ${'v<version>'} on ${RELEASE_FEED.provider} ${RELEASE_FEED.url}/${RELEASE_FEED.owner}/${RELEASE_FEED.repo}
for the commit in <release-output>/manifest.json, then uploads every installer and SHA256SUMS.

  <release-output>  Directory written by tools/release-desktop.mjs; every platform must have passed.
  --notes <file>    Markdown release notes; defaults to a one-line summary.
  --dry-run         Validate and print the requests without sending them.

RELEASE_TOKEN is a personal access token allowed to write releases. It is read from the
environment only and is never logged. A version with a prerelease part (0.2.0-beta.1) is
published as a prerelease.`);
}

/**
 * Parse the command line.
 *
 * Args:
 *   arguments_: Values supplied after the script name.
 * Returns: Output directory, optional notes file and dry-run flag.
 * Raises: Error for a missing or unknown argument.
 */
function parseArguments(arguments_) {
  const options = { output: null, notes: null, dryRun: false };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--notes') {
      options.notes = arguments_[index + 1];
      if (!options.notes) throw new Error('--notes requires a file.');
      index += 1;
    } else if (!argument.startsWith('--') && !options.output) options.output = path.resolve(argument);
    else throw new Error(`Unknown argument: ${argument}.`);
  }
  if (!options.output) throw new Error('Name the release output directory. Run with --help for usage.');
  return options;
}

/**
 * Load the manifest and prove every listed installer is present, named by the scheme and unchanged.
 *
 * Args:
 *   output: Release output directory.
 * Returns: Manifest version, commit and the files to upload.
 * Raises: Error when a platform did not pass, a name breaks the scheme, or a checksum differs.
 */
function verifiedRelease(output) {
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  if (!parseVersion(manifest.version ?? '')) throw new Error('manifest.json has no semantic version. Rebuild with the current tools/release-desktop.mjs.');
  const failed = Object.entries(manifest.platforms ?? {}).filter(([, result]) => result.status !== 'passed').map(([platform]) => platform);
  if (failed.length) throw new Error(`Platforms did not pass: ${failed.join(', ')}.`);
  if (!manifest.artifacts?.length) throw new Error('manifest.json lists no installers.');
  const files = manifest.artifacts.map((artifact) => {
    const file = path.join(output, artifact.path);
    const name = path.basename(file);
    if (parseAssetName(name)?.version !== manifest.version) throw new Error(`${name} does not name version ${manifest.version}.`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (digest !== artifact.sha256) throw new Error(`${name} changed after the build; its SHA-256 no longer matches manifest.json.`);
    return file;
  });
  files.push(path.join(output, 'SHA256SUMS'));
  return { version: manifest.version, commit: manifest.commit, files };
}

/**
 * Send one forge request and decode its JSON answer.
 *
 * Args:
 *   url: Endpoint.
 *   init: Fetch options including the authorization header.
 * Returns: Parsed JSON body.
 * Raises: Error naming the status and the forge's message.
 */
async function request(url, init) {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} answered HTTP ${response.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

/**
 * Create the release and upload its files.
 *
 * Args: None.
 * Returns: Nothing after the release page URL is printed.
 * Raises: Error for invalid input or any failed request; a partial release is left for the operator to inspect.
 */
async function main() {
  if (process.argv.includes('--help')) return help();
  const options = parseArguments(process.argv.slice(2));
  const { version, commit, files } = verifiedRelease(options.output);
  const tag = releaseTag(version);
  const api = releaseApi(RELEASE_FEED);
  const prerelease = parseVersion(version).prerelease.length > 0;
  const notes = options.notes ? fs.readFileSync(options.notes, 'utf8') : `Whisperer ${version}, built from commit ${commit}.`;
  const release = { tag_name: tag, target_commitish: commit, name: `Whisperer ${version}`, body: notes, draft: false, prerelease };

  console.log(`Feed: ${RELEASE_FEED.provider} ${RELEASE_FEED.url}/${RELEASE_FEED.owner}/${RELEASE_FEED.repo}`);
  console.log(`Release: ${tag} at ${commit}${prerelease ? ' (prerelease)' : ''}`);
  for (const file of files) console.log(`  ${path.basename(file)}`);
  if (options.dryRun) {
    console.log(`Dry run: would POST ${api.createUrl} and upload ${files.length} files.`);
    return;
  }

  const token = process.env.RELEASE_TOKEN;
  if (!token) throw new Error('Set RELEASE_TOKEN to a token that may write releases.');
  const authorization = api.authorization(token);
  const created = await request(api.createUrl, {
    method: 'POST',
    headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(release),
  });
  for (const file of files) {
    const name = path.basename(file);
    const content = new Blob([fs.readFileSync(file)]);
    let body = content;
    if (api.uploadAsForm) {
      body = new FormData();
      body.append('attachment', content, name);
    }
    console.log(`Uploading ${name}`);
    await request(api.uploadUrl(created.id, name), {
      method: 'POST',
      headers: { Authorization: authorization, Accept: 'application/json', ...(api.uploadAsForm ? {} : { 'Content-Type': 'application/octet-stream' }) },
      body,
    });
  }
  console.log(`Published ${created.html_url}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
