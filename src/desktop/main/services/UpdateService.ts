import type { UpdateInfo, UpdateStatus } from '../../shared/contracts';
import { updateInfoSchema } from '../../shared/protocol';
import { compareVersions, newestInstallable, releaseApi, type ForgeRelease, type ReleaseFeed } from '../../shared/releases';

/** Time between automatic checks while the app keeps running. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Delay before the first automatic check, so startup and sign-in requests go first. */
export const UPDATE_FIRST_CHECK_DELAY_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;

/** Collaborators of the update checker. */
export interface UpdateServiceDependencies {
  /** Release host and repository to query. */
  feed: ReleaseFeed;
  /** Version of the running build. */
  currentVersion: string;
  /** Node's `process.platform`. */
  platform: string;
  /** Node's `process.arch`. */
  arch: string;
  /** HTTP transport; the runtime passes a session fetch so the OS certificate store applies. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** Called after every state change. */
  onChange(status: UpdateStatus): void;
  /** Writes one diagnostic line. */
  log(message: string): void;
  /** Current time, injectable for tests. */
  now?(): Date;
}

/** Checks the public release feed for a newer installer for this platform and architecture. It never downloads or installs. */
export class UpdateService {
  private state: UpdateStatus;
  private flight: Promise<UpdateStatus> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  /** Args: dependencies supply the feed, the running build's identity, transport and callbacks. */
  public constructor(private readonly dependencies: UpdateServiceDependencies) {
    this.state = { currentVersion: dependencies.currentVersion, checking: false, checkedAt: null, update: null, error: null };
  }

  /** Returns the last known state. Args: none. Returns: renderer-safe update status. */
  public status(): UpdateStatus { return this.state; }

  /** Schedules the first check shortly after launch, then one on a fixed interval. Args: none. Returns: nothing. */
  public start(): void {
    if (this.running) return;
    this.running = true;
    const schedule = (delay: number): void => {
      // A check in flight when stop() runs must not re-arm the schedule.
      this.timer = setTimeout(() => { void this.check().finally(() => { if (this.running) schedule(UPDATE_CHECK_INTERVAL_MS); }); }, delay);
      this.timer.unref?.();
    };
    schedule(UPDATE_FIRST_CHECK_DELAY_MS);
  }

  /** Cancels scheduled checks. Args: none. Returns: nothing. */
  public stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Queries the feed once; concurrent callers share the request.
   *
   * Returns: The resulting status. A failure is reported in `error`, never as a rejection, and keeps an update already found.
   */
  public check(): Promise<UpdateStatus> {
    this.flight ??= this.run().finally(() => { this.flight = null; });
    return this.flight;
  }

  /**
   * Names the URL of the update on offer, so main never opens a renderer-supplied address.
   *
   * Args:
   *   target: The installer download or the release notes page.
   * Returns: The URL the feed returned, or null when no update is on offer.
   */
  public link(target: 'download' | 'release'): string | null {
    const update = this.state.update;
    if (!update) return null;
    return target === 'download' ? update.downloadUrl : update.pageUrl;
  }

  /** Performs one feed request and publishes the outcome. */
  private async run(): Promise<UpdateStatus> {
    this.publish({ ...this.state, checking: true });
    try {
      const update = await this.newest();
      const checkedAt = (this.dependencies.now?.() ?? new Date()).toISOString();
      return this.publish({ ...this.state, checking: false, checkedAt, update, error: null });
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError' ? 'The release feed did not answer in time.' : error instanceof Error ? error.message.slice(0, 300) : 'The update check failed.';
      this.dependencies.log(`Update check failed: ${message}`);
      return this.publish({ ...this.state, checking: false, error: message });
    }
  }

  /**
   * Fetches recent releases and picks one newer than the running build.
   *
   * Returns: The newer installable release, or null when this build is the newest.
   * Raises: Error when the feed is unreachable or answers with something other than a release list.
   */
  private async newest(): Promise<UpdateInfo | null> {
    const { feed, currentVersion, platform, arch } = this.dependencies;
    const response = await this.dependencies.fetch(releaseApi(feed).listUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`The release feed answered HTTP ${response.status}.`);
    const releases: unknown = await response.json();
    if (!Array.isArray(releases)) throw new Error('The release feed returned an unexpected response.');
    const newest = newestInstallable(releases as ForgeRelease[], platform, arch);
    if (!newest || compareVersions(newest.version, currentVersion) <= 0) return null;
    // Validate here, not only at the IPC boundary: one malformed field must fail this check, not every state event, and only http(s) links may reach the browser.
    const parsed = updateInfoSchema.safeParse({
      version: newest.version,
      name: newest.release.name?.trim() || `Whisperer ${newest.version}`,
      prerelease: newest.release.prerelease,
      publishedAt: newest.release.published_at,
      pageUrl: newest.release.html_url,
      downloadUrl: newest.asset.browser_download_url,
      assetName: newest.asset.name,
      bytes: newest.asset.size,
    });
    if (!parsed.success) throw new Error(`The release feed described ${newest.release.tag_name} incompletely.`);
    return parsed.data;
  }

  /** Stores and announces a state. */
  private publish(next: UpdateStatus): UpdateStatus {
    this.state = next;
    this.dependencies.onChange(next);
    return next;
  }
}
