/** Shared acceptance step for the macOS permission checklist that precedes sign-in. */
import assert from 'node:assert/strict';

const MAC_PERMISSIONS = ['microphone', 'accessibility', 'automation'];

/**
 * Continue past the macOS permission checklist when it precedes sign-in.
 *
 * An unsigned development or freshly packaged build has no Accessibility grant, so macOS shows the
 * checklist first. It must never appear on another platform, and it must only ask while a supported
 * permission is actually missing. Clicking Continue never changes host permissions.
 *
 * Args:
 *   page: Playwright page showing the hub window.
 *   onChecklist: Optional async callback that receives the page while the checklist is visible, for screenshots.
 * Returns: Missing permission ids when the checklist was passed, or null when sign-in showed first.
 * Raises: AssertionError when the checklist appears off macOS or without a missing permission; TimeoutError
 *   when neither surface renders within 20 seconds.
 */
export async function passPermissionPreflight(page, onChecklist) {
  const signIn = page.getByRole('button', { name: /sign in.*browser/i });
  const preflight = page.getByRole('heading', { name: /Check your Mac permissions|Everything is ready/i });
  await signIn.or(preflight).first().waitFor({ timeout: 20000 });
  if (!await preflight.isVisible()) return null;
  const { platform, capabilities } = await page.evaluate(() => window.whisperer.bootstrap());
  assert.equal(platform, 'darwin', 'The permission checklist must only precede sign-in on macOS.');
  const missing = MAC_PERMISSIONS.filter((id) => capabilities[id].supported && !capabilities[id].granted);
  if (await page.getByRole('heading', { name: 'Check your Mac permissions' }).isVisible()) {
    assert.ok(missing.length > 0, 'The permission checklist must only ask while a permission is missing.');
  }
  console.warn(`Continuing past the macOS permission checklist; missing: ${missing.join(', ') || 'none'}.`);
  if (onChecklist) await onChecklist(page);
  await page.getByRole('button', { name: /^Continue( anyway)?$/ }).click();
  return missing;
}
