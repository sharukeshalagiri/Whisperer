import { randomUUID } from 'node:crypto';
import type { Capabilities } from '../../shared/contracts';
import type { HoldShortcutCallbacks, HoldShortcutCapability } from './HoldShortcutService';

/** OS permissions managed by the desktop application. */
export type PlatformPermission = 'microphone' | 'accessibility' | 'automation' | 'screen';

/** A user-readable outcome from an operation that did not return data. */
export interface PlatformOperationResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** The current state and ownership of one operating-system permission. */
export interface PermissionStatus {
  readonly permission: PlatformPermission;
  readonly granted: boolean;
  readonly requestable: boolean;
  readonly reason?: string;
}

/** A focused Windows window captured before recording begins. */
export interface WindowsTarget {
  readonly platform: 'win32';
  readonly hwnd: string;
  readonly processId: string;
}

/** A focused macOS application window captured before recording begins. */
export interface MacTarget {
  readonly platform: 'darwin';
  readonly bundleId: string;
  readonly processId: string;
}

/** A focused X11 window captured before recording begins. */
export interface LinuxTarget {
  readonly platform: 'linux';
  readonly windowId: string;
  readonly processId: string;
}

/** An identity used solely to prevent insertion into a changed foreground target. */
export type CaptureTarget = WindowsTarget | MacTarget | LinuxTarget;

/** Renderer-safe capability state defined by the shared IPC contract. */
export type PlatformCapabilities = Capabilities;

/** The result of attempting clipboard-backed text insertion. */
export interface InsertTextResult {
  readonly inserted: boolean;
  readonly copied: boolean;
  readonly reason?: string;
}

/** The outcome of a global shortcut registration attempt. */
export interface ShortcutRegistration {
  readonly registered: boolean;
  readonly accelerator: string;
  readonly reason?: string;
}

/** The small execFile-compatible surface used for fixed native adapter commands. */
export interface CommandExecutor {
  /** Run a fixed executable with fixed or separately supplied arguments. */
  (file: string, args: readonly string[], options: { readonly timeout: number; readonly shell: false; readonly windowsHide?: boolean; readonly env?: Readonly<Record<string, string | undefined>> }): Promise<{ readonly stdout: string }>;
}

/** Electron clipboard operations used by the platform service. */
export interface ElectronClipboard {
  /** Replace the text clipboard. Electron 44 commits the write asynchronously, so callers await it. */
  writeText(text: string): void | Promise<void>;
  /**
   * Replace the clipboard with a marker in a private, non-text format, so a plain-text read returns
   * an empty string. On X11 a text write also takes the PRIMARY selection, which makes the target
   * drop the selection the user made; a non-text write leaves it alone.
   */
  writeSentinel?(id: string): Promise<void>;
  /** Read the current plain-text clipboard without exposing it to the renderer. */
  readText(): string | Promise<string>;
}

/** Electron global-shortcut operations used by the platform service. */
export interface ElectronGlobalShortcut {
  /** Register one application shortcut and report collisions. */
  register(accelerator: string, callback: () => void): boolean;
  /** Remove one application shortcut. */
  unregister(accelerator: string): void;
}

/** Electron macOS permission APIs used by the platform service. */
export interface ElectronSystemPreferences {
  /** Return Electron's current media-access state. */
  getMediaAccessStatus(mediaType: 'microphone' | 'screen'): string;
  /** Show the macOS microphone permission prompt. */
  askForMediaAccess(mediaType: 'microphone'): Promise<boolean>;
  /** Inspect or prompt for macOS accessibility trust. */
  isTrustedAccessibilityClient(prompt: boolean): boolean;
}

/** Electron shell operation used for fixed native Settings URLs. */
export interface ElectronShell {
  /** Open a fixed operating-system settings URL. */
  openExternal(url: string): Promise<void>;
}

/** The injected native hold trigger, isolated from ordinary toggle shortcuts. */
export interface HoldShortcutAdapter {
  /** Report whether the native trigger is installed, supported and permitted. */
  capability(): HoldShortcutCapability;
  /** Register an explicitly enabled press-and-hold trigger. */
  register(accelerator: string, callbacks: HoldShortcutCallbacks, enabled: boolean): ShortcutRegistration;
  /** Stop the trigger and any active hold recording. */
  unregister(): void;
}

/** Dependencies supplied by Electron's composition root. */
export interface PlatformServiceDependencies {
  readonly platform: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly execute: CommandExecutor;
  readonly clipboard: ElectronClipboard;
  readonly globalShortcut: ElectronGlobalShortcut;
  readonly systemPreferences: ElectronSystemPreferences;
  readonly shell: ElectronShell;
  /** Packaged macOS bundle identifier whose own consent records may be reset. */
  readonly bundleId?: string;
  /** Native hold trigger composed by the main process, when packaging provides it. */
  readonly holdShortcut?: HoldShortcutAdapter;
}

const WINDOWS_CAPTURE = "$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WhispererForeground { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'; $window = [WhispererForeground]::GetForegroundWindow(); [uint32]$ownerProcessId = 0; [void][WhispererForeground]::GetWindowThreadProcessId($window, [ref]$ownerProcessId); Write-Output $window.ToInt64(); Write-Output $ownerProcessId";
const WINDOWS_PASTE = "$ErrorActionPreference = 'Stop'; $expectedWindow = $env:WHISPERER_TARGET_HWND; $expectedProcessId = $env:WHISPERER_TARGET_PID; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WhispererPaste { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'; $window = [WhispererPaste]::GetForegroundWindow(); [uint32]$ownerProcessId = 0; [void][WhispererPaste]::GetWindowThreadProcessId($window, [ref]$ownerProcessId); if ($window.ToInt64().ToString() -eq $expectedWindow -and $ownerProcessId.ToString() -eq $expectedProcessId) { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v'); Write-Output 'sent' }";
const WINDOWS_COPY = "$ErrorActionPreference = 'Stop'; $expectedWindow = $env:WHISPERER_TARGET_HWND; $expectedProcessId = $env:WHISPERER_TARGET_PID; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WhispererCopy { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'; $window = [WhispererCopy]::GetForegroundWindow(); [uint32]$ownerProcessId = 0; [void][WhispererCopy]::GetWindowThreadProcessId($window, [ref]$ownerProcessId); if ($window.ToInt64().ToString() -eq $expectedWindow -and $ownerProcessId.ToString() -eq $expectedProcessId) { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c'); Write-Output 'sent' }";
const WINDOWS_RESTORE = "$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WhispererRestore { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'; if ([WhispererRestore]::SetForegroundWindow([IntPtr][int64]::Parse($env:WHISPERER_TARGET_HWND))) { Write-Output 'sent' }";
// System Events windows expose no stable id, so the frontmost application process is the focus identity.
const MAC_CAPTURE = 'tell application "System Events"\nset frontProcess to first application process whose frontmost is true\nreturn (bundle identifier of frontProcess) & linefeed & (unix id of frontProcess)\nend tell';
const MAC_PASTE = 'on run argv\ntell application "System Events"\nset frontProcess to first application process whose frontmost is true\nif bundle identifier of frontProcess is item 1 of argv and (unix id of frontProcess as text) is item 2 of argv then\nkeystroke "v" using command down\nreturn "sent"\nend if\nend tell\nreturn "focus-changed"\nend run';
const MAC_COPY = 'on run argv\ntell application "System Events"\nset frontProcess to first application process whose frontmost is true\nif bundle identifier of frontProcess is item 1 of argv and (unix id of frontProcess as text) is item 2 of argv then\nkeystroke "c" using command down\nreturn "sent"\nend if\nend tell\nreturn "focus-changed"\nend run';
const MAC_SELECT_ALL = 'on run argv\ntell application "System Events"\nset frontProcess to first application process whose frontmost is true\nif bundle identifier of frontProcess is item 1 of argv and (unix id of frontProcess as text) is item 2 of argv then\nkeystroke "a" using command down\nreturn "sent"\nend if\nend tell\nreturn "focus-changed"\nend run';
const WINDOWS_SELECT_ALL = "$ErrorActionPreference = 'Stop'; $expectedWindow = $env:WHISPERER_TARGET_HWND; $expectedProcessId = $env:WHISPERER_TARGET_PID; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WhispererSelect { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'; $window = [WhispererSelect]::GetForegroundWindow(); [uint32]$ownerProcessId = 0; [void][WhispererSelect]::GetWindowThreadProcessId($window, [ref]$ownerProcessId); if ($window.ToInt64().ToString() -eq $expectedWindow -and $ownerProcessId.ToString() -eq $expectedProcessId) { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^a'); Write-Output 'sent' }";
const MAC_RESTORE = 'on run argv\ntell application id (item 1 of argv) to activate\nreturn "sent"\nend run';
const WINDOWS_ENTER = "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}'); Write-Output 'sent'";
// Reading a harmless property proves Automation consent for System Events without sending input.
const MAC_AUTOMATION_PROBE = 'tell application "System Events" to return name of first application process whose frontmost is true';
const MAC_ENTER = 'tell application "System Events" to key code 36\nreturn "sent"';
const X11_UNAVAILABLE = 'X11 insertion requires the xdotool utility.';
/** Targets read the clipboard asynchronously after the paste key; restoring sooner could paste the old text. */
const CLIPBOARD_RESTORE_DELAY_MS = 750;
/** How long an X11 capture's displaced clipboard text waits for the paste that restores it. */
const X11_RESTORE_WINDOW_MS = 2 * 60_000;
const WAYLAND_UNAVAILABLE = 'Wayland insertion is unavailable because no consent-based adapter is installed.';
const INSERTION_UNAVAILABLE = 'Automatic insertion is unavailable on this platform.';
const FOCUS_CHANGED = 'The focused window changed before text could be inserted.';

/** Convert stdout produced by a fixed native command into nonempty trimmed lines. */
function outputLines(stdout: string): string[] {
  return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

/** Return whether a native identifier is a bounded decimal integer. */
function isDecimal(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

/** Return whether a macOS bundle identifier is safe to pass as an osascript argument. */
function isBundleId(value: string): boolean {
  return /^[A-Za-z0-9.-]{1,255}$/.test(value);
}

/** Provide safe main-process adapters for permissions, focus capture, insertion and shortcuts. */
export class PlatformService {
  /** Clipboard text an X11 selection capture displaced, restored after the next paste. */
  private pendingX11Restore: { text: string; at: number } | null = null;
  private registeredShortcut: string | null = null;
  /** Last observed System Events consent; null until probed so startup never triggers a prompt. */
  private automationGranted: boolean | null = null;

  /**
   * Create the service from Electron-owned APIs and a bounded command runner.
   *
   * Args:
   *   dependencies: Main-process integrations; renderer input never becomes an executable command.
   */
  constructor(private readonly dependencies: PlatformServiceDependencies) {}

  /**
   * Report native facilities without claiming that user-mediated or absent features work.
   *
   * Returns:
   *   Capability values suitable for direct display in the desktop UI.
   */
  async capabilityStatus(): Promise<PlatformCapabilities> {
    const insertion = await this.insertionCapability();
    const microphone = this.permissionStatus('microphone');
    const accessibility = this.permissionStatus('accessibility');
    const holdToTalk = this.dependencies.holdShortcut?.capability() ?? {
      supported: false,
      granted: false,
      reason: 'Hold-to-talk is unavailable because no native key-state library is installed.',
    };
    const automation = this.permissionStatus('automation');
    const autoPasteGranted = insertion.available && (this.dependencies.platform !== 'darwin' || (accessibility.granted && this.automationGranted !== false));
    return {
      microphone: { supported: true, granted: microphone.granted, reason: microphone.reason ?? null },
      accessibility: {
        supported: this.dependencies.platform === 'darwin',
        granted: accessibility.granted,
        reason: accessibility.reason ?? (this.dependencies.platform === 'darwin' ? null : 'Accessibility permission is not managed on this platform.'),
      },
      automation: {
        supported: this.dependencies.platform === 'darwin',
        granted: this.dependencies.platform === 'darwin' && automation.granted,
        reason: this.dependencies.platform === 'darwin' ? automation.reason ?? null : 'Automation permission is not managed on this platform.',
      },
      globalShortcut: {
        supported: true,
        granted: this.registeredShortcut !== null,
        reason: this.registeredShortcut ? null : 'No global shortcut is registered.',
      },
      autoPaste: {
        supported: insertion.available,
        granted: autoPasteGranted,
        reason: autoPasteGranted ? null : insertion.reason ?? accessibility.reason ?? 'Accessibility access is required for automatic insertion.',
      },
      holdToTalk,
      systemAudio: {
        supported: false,
        granted: false,
        reason: 'System-audio capture is not implemented; use microphone capture only.',
      },
    };
  }

  /**
   * List application permissions and state ownership by platform.
   *
   * Returns:
   *   One status for every permission the UI can request or explain.
   */
  listPermissions(): PermissionStatus[] {
    return ['microphone', 'accessibility', 'automation', 'screen'].map(permission => this.permissionStatus(permission as PlatformPermission));
  }

  /**
   * Request one platform permission when the operating system supports a main-process request.
   *
   * Args:
   *   permission: The application permission selected by the user.
   * Returns:
   *   An honest result, including a renderer-owned request explanation where needed.
   */
  async requestPermission(permission: PlatformPermission): Promise<PlatformOperationResult> {
    if (this.dependencies.platform !== 'darwin') {
      return {
        ok: false,
        reason: permission === 'microphone'
          ? 'Microphone permission is requested by the recorder getUserMedia call on this platform.'
          : 'This permission cannot be requested from Whisperer on this platform.',
      };
    }
    if (permission === 'microphone') return await this.dependencies.systemPreferences.askForMediaAccess('microphone')
      ? { ok: true }
      : { ok: false, reason: 'Microphone access was not granted.' };
    if (permission === 'accessibility') {
      if (this.dependencies.systemPreferences.isTrustedAccessibilityClient(false)) return { ok: true };
      // A grant recorded for an earlier build is silently ignored; clearing it lets macOS list this build afresh.
      await this.resetMacPermission('Accessibility');
      this.dependencies.systemPreferences.isTrustedAccessibilityClient(true);
      await this.openPermissionSettings('accessibility');
      return { ok: false, reason: 'Turn on Whisperer in Accessibility, then return here.' };
    }
    if (permission === 'automation') {
      if (await this.probeAutomation()) return { ok: true };
      await this.openPermissionSettings('automation');
      return { ok: false, reason: 'Allow Whisperer to control System Events in Automation, then return here.' };
    }
    return {
      ok: this.dependencies.systemPreferences.getMediaAccessStatus('screen') === 'granted',
      reason: 'Screen-recording access must be granted in macOS Privacy & Security settings.',
    };
  }

  /**
   * Capture the foreground target before recording starts.
   *
   * Returns:
   *   A target identity held only in main-process memory, or null when it cannot be captured safely.
   */
  async captureTarget(): Promise<CaptureTarget | null> {
    try {
      if (this.dependencies.platform === 'win32') return await this.captureWindowsTarget();
      if (this.dependencies.platform === 'darwin') return await this.captureMacTarget();
      if (this.dependencies.platform === 'linux') return await this.captureLinuxTarget();
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Capture plain selected text from a still-focused target without exposing its identity.
   *
   * Args:
   *   target: Main-process target captured before a review surface can take focus.
   * Returns:
   *   The selected text or null when focus, the selection or clipboard state cannot be verified.
   */
  async captureSelection(target: CaptureTarget | null): Promise<{ readonly text: string } | null> {
    if (!target || target.platform !== this.dependencies.platform || !this.isValidTarget(target)) return null;
    const capability = await this.insertionCapability();
    if (!capability.available || !await this.isStillFocused(target)) return null;
    if (target.platform === 'linux') return this.captureX11Selection(target);
    const priorClipboard = await this.dependencies.clipboard.readText();
    const sentinel = `whisperer-selection-${randomUUID()}`;
    await this.dependencies.clipboard.writeText(sentinel);
    try {
      if (!await this.sendCopy(target)) return null;
      const selected = await this.waitForClipboardChange(sentinel);
      if (!selected || !await this.isStillFocused(target)) return null;
      return { text: selected };
    } catch {
      return null;
    } finally {
      await this.dependencies.clipboard.writeText(priorClipboard);
    }
  }

  /**
   * Capture an X11 selection with a non-text sentinel.
   *
   * A text sentinel would take the PRIMARY selection, and the target would then drop the
   * selection it is about to copy. The private-format sentinel reads as empty text, so any copied
   * text is a change, even text equal to the user's clipboard. After a successful capture the
   * user's clipboard text is put back only after the replacement is pasted (insertText), because
   * writing it now would clear the selection that the apply step checks again.
   */
  private async captureX11Selection(target: CaptureTarget): Promise<{ readonly text: string } | null> {
    const clipboard = this.dependencies.clipboard;
    if (!clipboard.writeSentinel) return null;
    const prior = await clipboard.readText();
    let captured = false;
    try {
      await clipboard.writeSentinel(`whisperer-selection-${randomUUID()}`);
      const marker = await clipboard.readText();
      if (!await this.sendCopy(target)) return null;
      const selected = await this.waitForClipboardChange(marker);
      if (!selected || !await this.isStillFocused(target)) return null;
      captured = true;
      const pending = this.pendingX11Restore;
      if (!pending || Date.now() - pending.at > X11_RESTORE_WINDOW_MS) this.pendingX11Restore = { text: prior, at: Date.now() };
      return { text: selected };
    } catch {
      return null;
    } finally {
      if (!captured) await clipboard.writeText(prior);
    }
  }

  /** The clipboard text a recent X11 capture displaced, once; null when none is pending or it is stale. */
  private takePendingX11Restore(): string | null {
    const pending = this.pendingX11Restore;
    this.pendingX11Restore = null;
    return pending && Date.now() - pending.at <= X11_RESTORE_WINDOW_MS ? pending.text : null;
  }

  /**
   * Bring a previously captured app back to the front, for example after a click on Whisperer's pop-up.
   *
   * Args:
   *   target: Target captured when a shortcut transform ran.
   * Returns:
   *   Whether the activation request was sent.
   */
  async activateTarget(target: CaptureTarget | null): Promise<boolean> {
    if (!target || target.platform !== this.dependencies.platform || !this.isValidTarget(target)) return false;
    try {
      if (target.platform === 'win32') {
        const output = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_RESTORE], {
          timeout: 5000, shell: false, windowsHide: true, env: { ...this.dependencies.environment, WHISPERER_TARGET_HWND: target.hwnd },
        });
        return outputLines(output.stdout).includes('sent');
      }
      if (target.platform === 'darwin') {
        const output = await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_RESTORE, target.bundleId], { timeout: 4000, shell: false });
        return outputLines(output.stdout).includes('sent');
      }
      await this.dependencies.execute('xdotool', ['windowactivate', target.windowId], { timeout: 2000, shell: false });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Select the whole focused field of a still-focused target, as Cmd/Ctrl+A would.
   *
   * Args:
   *   target: Main-process target captured when the shortcut fired.
   * Returns:
   *   Whether the select-all keystroke reached the same target.
   */
  async selectAll(target: CaptureTarget | null): Promise<boolean> {
    if (!target || target.platform !== this.dependencies.platform || !this.isValidTarget(target)) return false;
    if (!(await this.insertionCapability()).available || !await this.isStillFocused(target)) return false;
    try {
      if (target.platform === 'win32') {
        const output = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SELECT_ALL], {
          timeout: 5000, shell: false, windowsHide: true,
          env: { ...this.dependencies.environment, WHISPERER_TARGET_HWND: target.hwnd, WHISPERER_TARGET_PID: target.processId },
        });
        return outputLines(output.stdout).includes('sent');
      }
      if (target.platform === 'darwin') {
        const output = await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_SELECT_ALL, target.bundleId, target.processId], { timeout: 4000, shell: false });
        return outputLines(output.stdout).includes('sent');
      }
      return await this.sendX11Key(target, 'ctrl+a');
    } catch {
      return false;
    }
  }

  /**
   * Paste a transform result over its source when the same text is still selected in the same target.
   *
   * Args:
   *   text: Generated replacement.
   *   target: Target captured when the shortcut fired.
   *   sourceText: Exact text captured before generation.
   * Returns:
   *   Whether the replacement was pasted, with a user-facing reason when not.
   */
  async replaceCapturedSelection(text: string, target: CaptureTarget | null, sourceText: string): Promise<{ readonly applied: boolean; readonly reason?: string }> {
    const selection = await this.captureSelection(target);
    if (!selection || selection.text !== sourceText) return { applied: false, reason: 'The selected text changed while the transform ran, so nothing was replaced.' };
    const result = await this.insertText(text, target);
    return result.inserted ? { applied: true } : { applied: false, reason: result.reason };
  }

  /**
   * Replace a verified selection only if it has not changed while the user reviewed a proposal.
   *
   * Args:
   *   text: Accepted replacement text.
   *   target: Main-process target captured before review UI changed focus.
   *   expected: Immutable selected source text and the focused, main-process-owned review target.
   * Returns:
   *   Whether the replacement was applied, with a safe user-facing failure reason when not.
   */
  async replaceSelection(text: string, target: CaptureTarget | null, expected: { readonly sourceText: string; readonly reviewTarget: CaptureTarget | null }): Promise<{ readonly applied: boolean; readonly reason?: string }> {
    if (!target || !await this.restoreTarget(target, expected.reviewTarget)) {
      return { applied: false, reason: 'The review window lost focus before the replacement could be applied.' };
    }
    const selection = await this.captureSelection(target);
    if (!selection || selection.text !== expected.sourceText) {
      return { applied: false, reason: 'The original selection changed before the replacement could be applied.' };
    }
    const result = await this.insertText(text, target);
    return result.inserted ? { applied: true } : { applied: false, reason: result.reason };
  }

  /**
   * Copy completed dictation and paste only when its pre-recording target is still focused.
   *
   * Args:
   *   text: Completed, nonempty dictation text.
   *   target: Main-process target captured before recording began.
   * Returns:
   *   Whether text was copied and pasted; clipboard text remains available after a successful attempt.
   */
  async insertText(text: string, target: CaptureTarget | null): Promise<InsertTextResult> {
    if (!text) return { inserted: false, copied: false, reason: 'There is no completed text to insert.' };
    const capability = await this.insertionCapability();
    if (!capability.available) return { inserted: false, copied: false, reason: capability.reason };
    if (this.dependencies.platform === 'darwin' && !this.dependencies.systemPreferences.isTrustedAccessibilityClient(false)) {
      return { inserted: false, copied: false, reason: 'macOS has not given this Whisperer build Accessibility access.' };
    }
    if (!target || target.platform !== this.dependencies.platform) {
      return { inserted: false, copied: false, reason: this.automationGranted === false ? 'macOS blocked Whisperer from controlling System Events.' : 'No safe insertion target was captured before recording.' };
    }
    if (!this.isValidTarget(target)) return { inserted: false, copied: false, reason: `The saved ${this.targetPlatformName(target)} target is invalid.` };
    if (!await this.isStillFocused(target)) return { inserted: false, copied: false, reason: FOCUS_CHANGED };

    // After an X11 capture the clipboard holds the copied selection; restore what the user had.
    const previous = this.takePendingX11Restore() ?? await this.readClipboard();
    await this.dependencies.clipboard.writeText(text);
    try {
      const inserted = await this.sendPaste(target);
      // The paste is done: give the user their clipboard back once the target has read it.
      if (inserted && previous !== null) void this.restoreClipboard(text, previous);
      return inserted ? { inserted: true, copied: true } : { inserted: false, copied: true, reason: FOCUS_CHANGED };
    } catch {
      return { inserted: false, copied: true, reason: 'The operating system did not allow automatic insertion; text remains on the clipboard.' };
    }
  }

  /** Reads the plain-text clipboard, or null when it cannot be read. */
  private async readClipboard(): Promise<string | null> {
    try { return await this.dependencies.clipboard.readText(); } catch { return null; }
  }

  /** Puts the user's previous text back, unless something else changed the clipboard meanwhile. */
  private async restoreClipboard(pasted: string, previous: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, CLIPBOARD_RESTORE_DELAY_MS));
    try {
      if (await this.dependencies.clipboard.readText() === pasted) await this.dependencies.clipboard.writeText(previous);
    } catch {
      // Leaving the dictation on the clipboard is the safe outcome.
    }
  }

  /**
   * Send one Enter key to the currently focused application through the same fixed native adapters as paste.
   *
   * Raises:
   *   Error: Automatic input is unavailable or the operating system refused it.
   */
  async pressEnter(): Promise<void> {
    const capability = await this.insertionCapability();
    if (!capability.available) throw new Error(capability.reason ?? INSERTION_UNAVAILABLE);
    if (this.dependencies.platform === 'win32') {
      await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_ENTER], { timeout: 5000, shell: false, windowsHide: true });
    } else if (this.dependencies.platform === 'darwin') {
      await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_ENTER], { timeout: 4000, shell: false });
    } else {
      await this.dependencies.execute('xdotool', ['key', '--clearmodifiers', 'Return'], { timeout: 2000, shell: false });
    }
  }

  /**
   * Register an application-owned global shortcut and return the actual operating-system outcome.
   *
   * Args:
   *   accelerator: Electron accelerator text selected by trusted main-process configuration.
   *   onToggle: Callback to run once for each global shortcut press.
   * Returns:
   *   Registration state; collisions never masquerade as success.
   */
  registerShortcut(accelerator: string, onToggle: () => void): ShortcutRegistration {
    if (!accelerator.trim()) return { registered: false, accelerator, reason: 'Choose a shortcut before registering it.' };
    this.unregisterShortcut();
    try {
      if (!this.dependencies.globalShortcut.register(accelerator, onToggle)) {
        return { registered: false, accelerator, reason: 'The shortcut is unavailable because another application is using it.' };
      }
      this.registeredShortcut = accelerator;
      return { registered: true, accelerator };
    } catch {
      return { registered: false, accelerator, reason: 'The shortcut could not be registered by the operating system.' };
    }
  }

  /**
   * Remove the shortcut registered by this service, leaving other application shortcuts intact.
   *
   * Returns:
   *   Nothing after the owned shortcut is unregistered.
   */
  unregisterShortcut(): void {
    if (!this.registeredShortcut) return;
    this.dependencies.globalShortcut.unregister(this.registeredShortcut);
    this.registeredShortcut = null;
  }

  /**
   * Register an explicitly enabled press-and-hold trigger without changing toggle-mode shortcuts.
   *
   * Args:
   *   accelerator: A trusted main-process configured shortcut.
   *   callbacks: Main-process recording lifecycle callbacks.
   *   enabled: The explicit user preference for hold-to-talk.
   * Returns:
   *   Native-registration state or the truthful unavailable reason.
   */
  registerHoldShortcut(accelerator: string, callbacks: HoldShortcutCallbacks, enabled: boolean): ShortcutRegistration {
    if (!this.dependencies.holdShortcut) {
      return { registered: false, accelerator, reason: 'Hold-to-talk is unavailable because no native key-state library is installed.' };
    }
    return this.dependencies.holdShortcut.register(accelerator, callbacks, enabled);
  }

  /** Stop native hold-to-talk callbacks during pause, logout or application shutdown. */
  unregisterHoldShortcut(): void {
    this.dependencies.holdShortcut?.unregister();
  }

  /**
   * Open the fixed operating-system settings page relevant to one permission.
   *
   * Args:
   *   permission: The settings category to open.
   * Returns:
   *   Whether a documented platform settings URL was launched.
   */
  async openPermissionSettings(permission: PlatformPermission): Promise<PlatformOperationResult> {
    const url = this.settingsUrl(permission);
    if (!url) return { ok: false, reason: 'Permission settings cannot be opened automatically on this platform.' };
    try {
      await this.dependencies.shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'The operating-system settings page could not be opened.' };
    }
  }

  /**
   * Check System Events consent; the first call shows the macOS Automation prompt.
   *
   * Returns:
   *   Whether fixed paste and focus scripts may run.
   */
  async probeAutomation(): Promise<boolean> {
    if (this.dependencies.platform !== 'darwin') return false;
    try {
      await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_AUTOMATION_PROBE], { timeout: 15000, shell: false });
      this.automationGranted = true;
    } catch {
      this.automationGranted = false;
    }
    return this.automationGranted;
  }

  /** Clear this application's own macOS consent record with a fixed tccutil invocation. */
  private async resetMacPermission(service: 'Accessibility' | 'AppleEvents'): Promise<void> {
    if (!this.dependencies.bundleId || !isBundleId(this.dependencies.bundleId)) return;
    try {
      await this.dependencies.execute('/usr/bin/tccutil', ['reset', service, this.dependencies.bundleId], { timeout: 4000, shell: false });
    } catch {
      // Development builds have no registered bundle; the Settings page still lets the user add the app.
    }
  }

  /** Return the available insertion path for the current desktop session. */
  private async insertionCapability(): Promise<{ readonly available: boolean; readonly reason?: string }> {
    if (this.dependencies.platform === 'win32' || this.dependencies.platform === 'darwin') return { available: true };
    if (this.dependencies.platform !== 'linux') return { available: false, reason: INSERTION_UNAVAILABLE };
    if (this.dependencies.environment.XDG_SESSION_TYPE?.toLowerCase() === 'wayland') return { available: false, reason: WAYLAND_UNAVAILABLE };
    try {
      await this.dependencies.execute('xdotool', ['--version'], { timeout: 2000, shell: false });
      return { available: true };
    } catch {
      return { available: false, reason: X11_UNAVAILABLE };
    }
  }

  /** Return the visible permission status for one named permission. */
  private permissionStatus(permission: PlatformPermission): PermissionStatus {
    if (this.dependencies.platform !== 'darwin') {
      return {
        permission,
        granted: false,
        requestable: permission === 'microphone',
        reason: permission === 'microphone'
          ? 'The recorder requests microphone access with getUserMedia.'
          : 'This permission is not managed by the Electron main process on this platform.',
      };
    }
    if (permission === 'microphone' || permission === 'screen') {
      const granted = this.dependencies.systemPreferences.getMediaAccessStatus(permission) === 'granted';
      return { permission, granted, requestable: permission === 'microphone', reason: granted ? undefined : 'Grant access in macOS Privacy & Security settings.' };
    }
    if (permission === 'automation') {
      const granted = this.automationGranted === true;
      // Unknown stays reasonless so callers can tell "not yet asked" from a recorded denial.
      const reason = this.automationGranted === false ? 'Allow Whisperer to control System Events so it can paste for you.' : this.automationGranted === null ? 'Not checked yet.' : undefined;
      return { permission, granted, requestable: true, reason };
    }
    const granted = this.dependencies.systemPreferences.isTrustedAccessibilityClient(false);
    return { permission, granted, requestable: true, reason: granted ? undefined : 'Turn on Whisperer in Accessibility. If it is already on, remove it and allow it again; each new build needs fresh approval.' };
  }

  /** Capture a Windows handle and owning process using a fixed PowerShell program. */
  private async captureWindowsTarget(): Promise<WindowsTarget | null> {
    const output = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_CAPTURE], { timeout: 5000, shell: false, windowsHide: true });
    const [hwnd, processId] = outputLines(output.stdout);
    return hwnd && processId && isDecimal(hwnd) && isDecimal(processId) ? { platform: 'win32', hwnd, processId } : null;
  }

  /** Capture the frontmost macOS application bundle and process using a fixed AppleScript. */
  private async captureMacTarget(): Promise<MacTarget | null> {
    let output: { readonly stdout: string };
    try {
      output = await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_CAPTURE], { timeout: 4000, shell: false });
      this.automationGranted = true;
    } catch (error) {
      // osascript reports -1743 when the user or policy denied control of System Events.
      if (String((error as { stderr?: unknown })?.stderr ?? error).includes('-1743')) this.automationGranted = false;
      throw error;
    }
    const [bundleId, processId] = outputLines(output.stdout);
    return bundleId && processId && isBundleId(bundleId) && isDecimal(processId)
      ? { platform: 'darwin', bundleId, processId }
      : null;
  }

  /** Capture the X11 focus and owning process only when xdotool is available. */
  private async captureLinuxTarget(): Promise<LinuxTarget | null> {
    const capability = await this.insertionCapability();
    if (!capability.available) return null;
    const window = await this.dependencies.execute('xdotool', ['getwindowfocus'], { timeout: 2000, shell: false });
    const windowId = outputLines(window.stdout)[0];
    if (!windowId || !isDecimal(windowId)) return null;
    const process = await this.dependencies.execute('xdotool', ['getwindowpid', windowId], { timeout: 2000, shell: false });
    const processId = outputLines(process.stdout)[0];
    return processId && isDecimal(processId) ? { platform: 'linux', windowId, processId } : null;
  }

  /** Check focus before replacing the clipboard, so cancelled or stale actions leave it unchanged. */
  private async isStillFocused(target: CaptureTarget): Promise<boolean> {
    const current = await this.captureTarget();
    return current !== null && this.sameTarget(target, current);
  }

  /** Compare only platform-specific stable target identities. */
  private sameTarget(left: CaptureTarget, right: CaptureTarget): boolean {
    if (left.platform !== right.platform) return false;
    if (left.platform === 'win32' && right.platform === 'win32') return left.hwnd === right.hwnd && left.processId === right.processId;
    if (left.platform === 'darwin' && right.platform === 'darwin') return left.bundleId === right.bundleId && left.processId === right.processId;
    return left.platform === 'linux' && right.platform === 'linux' && left.windowId === right.windowId && left.processId === right.processId;
  }

  /** Restore the original target only when the main-owned review window is still foreground. */
  private async restoreTarget(target: CaptureTarget, reviewTarget: CaptureTarget | null): Promise<boolean> {
    if (!reviewTarget || reviewTarget.platform !== target.platform || !this.isValidTarget(target) || !this.isValidTarget(reviewTarget)) return false;
    if (!await this.isStillFocused(reviewTarget)) return false;
    try {
      if (target.platform === 'win32') {
        const output = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_RESTORE], {
          timeout: 5000,
          shell: false,
          windowsHide: true,
          env: { ...this.dependencies.environment, WHISPERER_TARGET_HWND: target.hwnd },
        });
        if (!outputLines(output.stdout).includes('sent')) return false;
      } else if (target.platform === 'darwin') {
        const output = await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_RESTORE, target.bundleId], { timeout: 4000, shell: false });
        if (!outputLines(output.stdout).includes('sent')) return false;
      } else {
        await this.dependencies.execute('xdotool', ['windowactivate', '--sync', target.windowId], { timeout: 2000, shell: false });
      }
      return await this.isStillFocused(target);
    } catch {
      return false;
    }
  }

  /** Wait briefly for a copy command to replace the clipboard, rejecting stale clipboard text. */
  private async waitForClipboardChange(previous: string): Promise<string | null> {
    // Browsers and Electron apps can take several hundred milliseconds to publish a copy.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = await this.dependencies.clipboard.readText();
      if (current !== previous) return current;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    return null;
  }

  /**
   * Send one key chord to the captured X11 window as real (XTEST) input.
   *
   * GTK and other toolkits ignore synthetic XSendEvent keys (`xdotool key --window`), so the
   * chord goes to the focused window, and only after the captured window is confirmed focused
   * immediately before it.
   */
  private async sendX11Key(target: CaptureTarget, chord: string): Promise<boolean> {
    if (!await this.isStillFocused(target)) return false;
    await this.dependencies.execute('xdotool', ['key', '--clearmodifiers', chord], { timeout: 2000, shell: false });
    return true;
  }

  /** Send a copy command to a verified target without allowing mutable foreground focus to choose it. */
  private async sendCopy(target: CaptureTarget): Promise<boolean> {
    if (target.platform === 'win32') {
      const output = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_COPY], {
        timeout: 5000,
        shell: false,
        windowsHide: true,
        env: { ...this.dependencies.environment, WHISPERER_TARGET_HWND: target.hwnd, WHISPERER_TARGET_PID: target.processId },
      });
      return outputLines(output.stdout).includes('sent');
    }
    if (target.platform === 'darwin') {
      const output = await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_COPY, target.bundleId, target.processId], { timeout: 4000, shell: false });
      return outputLines(output.stdout).includes('sent');
    }
    return this.sendX11Key(target, 'ctrl+c');
  }

  /** Send the OS-specific paste after focus comparison, without a shell or code interpolation. */
  private async sendPaste(target: CaptureTarget): Promise<boolean> {
    if (target.platform === 'win32') {
      const output = await this.dependencies.execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_PASTE], {
        timeout: 5000,
        shell: false,
        windowsHide: true,
        env: { ...this.dependencies.environment, WHISPERER_TARGET_HWND: target.hwnd, WHISPERER_TARGET_PID: target.processId },
      });
      return outputLines(output.stdout).includes('sent');
    }
    if (target.platform === 'darwin') {
      const output = await this.dependencies.execute('/usr/bin/osascript', ['-e', MAC_PASTE, target.bundleId, target.processId], { timeout: 4000, shell: false });
      return outputLines(output.stdout).includes('sent');
    }
    return this.sendX11Key(target, 'ctrl+v');
  }

  /** Validate externally supplied target-shaped data before it reaches native arguments. */
  private isValidTarget(target: CaptureTarget): boolean {
    if (target.platform === 'win32') return isDecimal(target.hwnd) && isDecimal(target.processId);
    if (target.platform === 'darwin') return isBundleId(target.bundleId) && isDecimal(target.processId);
    return isDecimal(target.windowId) && isDecimal(target.processId);
  }

  /** Return the name used in invalid-target error messages. */
  private targetPlatformName(target: CaptureTarget): string {
    return target.platform === 'win32' ? 'Windows' : target.platform === 'darwin' ? 'macOS' : 'Linux';
  }

  /** Return an OS-owned settings deep link for a supported permission category. */
  private settingsUrl(permission: PlatformPermission): string | null {
    if (this.dependencies.platform === 'darwin') {
      if (permission === 'microphone') return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';
      if (permission === 'accessibility') return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
      if (permission === 'automation') return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation';
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    }
    if (this.dependencies.platform === 'win32') {
      if (permission === 'microphone') return 'ms-settings:privacy-microphone';
      return null;
    }
    return null;
  }
}
