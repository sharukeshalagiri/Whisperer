# Desktop release build

`tools/release-desktop.mjs` builds one committed desktop revision for Linux, Windows, and macOS. It creates installers and verification records. It does not publish a release. `tools/publish-release.mjs` publishes a verified build, and installed apps find it through their update check.

## Naming and versioning

Every release follows one scheme, which the desktop update check depends on.

| Item | Form | Example |
| --- | --- | --- |
| Version | [Semantic Versioning 2.0.0](https://semver.org), in `package.json` `version` | `0.2.0-beta.1`, `0.2.0` |
| Git tag | `v<version>` | `v0.2.0-beta.1` |
| Release title | `Whisperer <version>` | `Whisperer 0.2.0-beta.1` |
| Installer | `Whisperer-<version>-<os>-<arch>.<ext>` | `Whisperer-0.2.0-beta.1-mac-arm64.dmg` |

- `<os>` is `mac`, `win` or `linux`. `<arch>` is what electron-builder writes: `x64` or `arm64`, except that Debian packages write x64 as `amd64`. `<ext>` is `dmg`, `exe` or `deb`. The top-level `artifactName` in `package.json` produces these names, and `release-desktop.mjs` refuses to collect an installer that breaks them.
- Bump `package.json` `version` in the commit you release. Every release needs a new version, because the version is how installed apps tell builds apart. Preview builds `v0.1.0-preview.2` to `.6` all shipped as `0.1.0` with older installer names. Apps from those builds have no update check, and the check ignores those releases.
- Use a prerelease suffix (`-beta.N`, `-rc.N`) while the product is in beta. `publish-release.mjs` marks such a version as a prerelease. Ordering follows SemVer, so `0.2.0-beta.2` is older than `0.2.0`, which is older than `0.2.1-beta.1`.
- Never reuse or move a tag. Publish a new patch or prerelease version instead.

## Releases from GitHub Actions

On GitHub, pushing a `v<version>` tag runs `.github/workflows/release.yml`. It checks that the tag matches `package.json`, builds the Linux `.deb` on Ubuntu, the Windows NSIS installer on Windows and both macOS `.dmg` files on an Apple Silicon runner, and checks every name against `releases.ts`. It then creates a **draft** release titled `Whisperer <version>` with the installers, a `SHA256SUMS` file and notes taken from that version's `CHANGELOG.md` section, plus a line saying the builds are unsigned. A draft is invisible to the update check until someone publishes it on GitHub.

```sh
git tag v0.2.0-beta.1 && git push origin v0.2.0-beta.1
```

Push only the one tag, never `--tags`. Delete and recreate a tag only while its release is still a draft and nobody has downloaded from it.

## Update checks in the app

The desktop main process asks the release feed for its recent releases 30 seconds after launch and every six hours after that, and again whenever the user chooses **Check for updates** in Settings > System or in the tray menu. Only packaged builds check on their own. It takes the release with the highest version, prereleases included and drafts excluded, that has an installer for this operating system and architecture. When that version is newer than the running one, the notifications bell gets a dot and its popover offers **Download** and **Release notes**. Settings > System and the tray offer the download too.

The app does not download or install anything itself. Its builds are unsigned, and Electron's built-in updater needs signed macOS and Windows builds. The user's browser downloads the installer, and the user runs it over the installed app; their data stays in place. The check sends no credentials, so the release repository must be public. A failed check is logged and shown in Settings, and an update already found stays on offer.

## Changing the release host

The feed is set in one place, `RELEASE_FEED` in [`src/desktop/shared/releases.ts`](../src/desktop/shared/releases.ts). It points at this project's GitHub repository:

```ts
export const RELEASE_FEED: ReleaseFeed = {
  provider: 'github',             // 'github' or 'gitea'
  url: 'https://github.com',
  owner: 'sharukeshalagiri',        // a fork sets its own user or organization
  repo: 'Whisperer',
}
```

A fork that publishes its own releases sets `owner` to the GitHub user or organization that hosts it before building a release. Otherwise its builds check, and `publish-release.mjs` publishes to, this repository.

For GitHub Enterprise Server, set `url` to its web origin; the API lives under `/api/v3`. Gitea and Forgejo use the Gitea provider, for example `{ provider: 'gitea', url: 'https://git.example.com', owner: '<owner>', repo: 'Whisperer' }`.

Apps check the feed compiled into them. Before you retire a host, publish one release on the old host from a build that already points at the new one, so installed apps find the move. Keep the old releases readable until users have updated.

`releaseApi()` in the same file is the only code that knows each forge's endpoints, upload format and token header. To support another forge with a compatible release JSON, add a provider there and a test in `releases.test.ts`.

## Publishing

After a release build passes, publish it from a machine holding a token that may write releases:

```sh
# Check what would be created, without contacting the forge.
node tools/publish-release.mjs dist/release-<commit-prefix> --notes notes.md --dry-run

# Create tag v<version> at the built commit and upload every installer and SHA256SUMS.
RELEASE_TOKEN=<token> node tools/publish-release.mjs dist/release-<commit-prefix> --notes notes.md
```

The script refuses to publish when a platform in `manifest.json` did not pass, an installer's name does not carry the manifest version, or an installer's SHA-256 no longer matches the manifest. It reads the token only from the environment and never prints it. Publishing is an outward action: do it only with the release owner's approval. If an upload fails, the release already exists with the files uploaded so far; delete it on the forge or upload the rest there.

Run it from a committed checkout. macOS builds run over SSH on a Mac you name, so either pass the host and workspace parent or export them:

```sh
export WHISPERER_MAC_HOST=build-mac.example        # SSH host or ~/.ssh/config alias
export WHISPERER_MAC_BUILD_ROOT=<build-root>       # absolute path on the Mac, e.g. $HOME/whisperer-build expanded
node tools/release-desktop.mjs --commit "$(git rev-parse HEAD)"
```

To keep these out of your shell profile, put them in a per-user release config instead. It lives outside every checkout, so a real host name or path never enters the repository:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\whisperer\release.json` |
| macOS and Linux | `$XDG_CONFIG_HOME/whisperer/release.json`, or `~/.config/whisperer/release.json` |

```json
{
  "macHost": "build-mac.example",
  "macBuildRoot": "/Users/<user>/whisperer-build",
  "macNodePath": "/opt/homebrew/bin"
}
```

Every key is optional. A command-line option wins over the environment variable, which wins over the config file. The script rejects a config that is not a JSON object of strings or has unknown keys.

Without any of them, a run that includes `macos` stops with an error naming the missing option and the config path. `--platform linux,windows` needs none of them.

The default output is `dist/release-<commit-prefix>`. `dist/` is ignored. Do not add installers, checksums, screenshots, or manifests to Git.

## Inputs

The script archives the requested Git commit, which leaves out untracked files. It extracts a new local workspace for each Linux and Windows build and creates a new macOS workspace under the build root.

Every host receives the same full commit SHA. The script records it in `manifest.json` with each artifact digest.

Noninteractive SSH often lacks the Mac user's Node installation on `PATH`. Pass `--mac-node-path <dir>` or set `WHISPERER_MAC_NODE_PATH` to prepend that directory. The script calls `node tools/commands.mjs` directly on macOS rather than `make`, so the Mac does not need Xcode command line tools.

## Outputs and checks

The build order defaults to Linux, Windows, then macOS. Each local source workspace runs `setup`, desktop linting, desktop tests, and loopback fixture acceptance before its platform package command.

Linux runs `commands.mjs linux` and starts the unpacked executable through Chromium CDP. Windows runs `commands.mjs windows` through the pinned Docker Wine toolchain. macOS runs `setup`, linting, tests, loopback fixture acceptance, and `dmg`. It starts the unpacked executable matching the VM architecture through Chromium CDP. Both packaged architectures receive ASAR checks.

The release script reads the version from the commit's `package.json` and stops unless it is a semantic version. It collects only `.deb`, `.exe`, and `.dmg` installers named by the scheme above. It writes `SHA256SUMS` and `manifest.json` after each completed platform, so a failed build states the failed platform and does not mark later checks as passed. The manifest records `version` and `tag`, which `publish-release.mjs` uses.

Windows validation does not launch the installer or executable on a Windows host because no Windows VM is configured. Linux does not install the `.deb` on a clean system. The Intel macOS VM cannot launch the ARM installer. macOS does not install, sign, notarize, or staple its DMGs. These limits remain in the manifest.

## On-device mode in packages

Packages ship the API Python source, the root and API `pyproject.toml` files and `uv.lock` as `extraResources` under `resources/api`, outside the ASAR. They ship no `uv`, no Python, no wheels and no models. The desktop fetches those after an explicit user action, pinned by `src/desktop/main/runtime/runtime-manifest.json`. The release build does not run that download, so a successful release proves the layout and not the install.

Only a Linux x64 run through the real installer and server has been done, from the source tree and from a copy of the `extraResources` layout. A packaged device mode run on any platform, and the install on macOS, Windows and Linux arm64, are still open in the [roadmap](roadmap.md).

## Options

```sh
# Inspect every local and remote command without building.
node tools/release-desktop.mjs --commit "$(git rev-parse HEAD)" --dry-run

# Resume one platform for the same commit and retain prior manifest results.
node tools/release-desktop.mjs --commit <full-commit-sha> --platform macos

# Use a different output directory or approved macOS build host.
node tools/release-desktop.mjs \
  --commit <full-commit-sha> \
  --dist /srv/whisperer-installer-output \
  --mac-host build-mac.example \
  --mac-build-root <build-root>
```

`--dist` must be outside the checkout or within its ignored `dist/` directory. An existing output must have a manifest for the same commit. This prevents mixing installers from separate builds. `--mac-host` accepts an SSH host or alias. `--mac-build-root` and `--mac-node-path` accept absolute simple paths. The script uses literal local argument arrays and validates the remote values before constructing its limited remote commands.

The script never commits, pushes, publishes, deploys, deletes remote files, or copies personal data or secrets. Review the manifest and installers before publishing a release with `publish-release.mjs`.
