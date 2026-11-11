import type { DesktopPlatform } from './contracts';

/** Present an Electron accelerator as familiar platform keyboard labels.
 * Args: accelerator is the configured shortcut; platform selects keyboard conventions.
 * Returns: a human-readable label, or an empty string for a disabled shortcut.
 */
export function shortcutLabel(accelerator: string, platform: DesktopPlatform): string {
  const mac = platform === 'darwin';
  const labels: Record<string, string> = {
    commandorcontrol: mac ? '⌘' : 'Ctrl', cmdorctrl: mac ? '⌘' : 'Ctrl',
    command: '⌘', cmd: '⌘', control: 'Ctrl', ctrl: 'Ctrl',
    shift: mac ? '⇧' : 'Shift', alt: mac ? '⌥' : 'Alt', option: '⌥',
    meta: mac ? '⌘' : 'Win', super: mac ? '⌘' : 'Win', space: 'Space',
  };
  return accelerator.split('+').filter(Boolean).map((token) => labels[token.toLowerCase()] ?? token).join(mac ? ' ' : ' + ');
}
