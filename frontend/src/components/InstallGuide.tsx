import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui';
import { installHint, isRunningInstalled, type InstallHint } from '@/lib/install';
import { useInstallPrompt } from '@/lib/use-install-prompt';

/**
 * A row in the account hub's Settings group: install Bilikha on this device.
 *
 * Two shapes, and which one appears is not a preference:
 *
 * - **Install** — a real button, when the browser has offered its prompt. It
 *   opens the browser's own dialog; the person still confirms. No website can
 *   install itself, on any browser.
 * - **How to install** — a disclosure naming where the browser keeps the
 *   control, for everywhere the prompt never fires. That is every browser on
 *   iOS, which has no such event and installs from the Share sheet.
 *
 * The fallback is not dead code waiting to be deleted. iOS is a large share of
 * this audience and will never reach the first shape.
 */

const COPY: Record<Exclude<InstallHint, 'none'>, { noun: string; steps: string }> = {
  ios: {
    noun: 'phone',
    steps:
      'Tap the Share button at the bottom of the screen, scroll down, and choose Add to Home Screen.',
  },
  android: {
    noun: 'phone',
    steps: 'Tap the ⋮ button at the top right of your browser, then choose Install app.',
  },
  desktop: {
    noun: 'computer',
    steps:
      'Click the install icon at the right-hand end of the address bar, where the web address is shown at the top of this window.',
  },
};

export function InstallGuide() {
  // Resolved after mount, not in a lazy initialiser, and the lint warning about
  // that is accepted on purpose. Both inputs are browser state; computing them
  // during render would read `navigator` on the server once SSR lands
  // (constraint 4) and would disagree with the server's markup at hydration.
  // Rendering nothing first and the row a tick later is correct here.
  const [hint, setHint] = useState<InstallHint>('none');
  const [open, setOpen] = useState(false);
  const { canInstall, installed, declined, install } = useInstallPrompt();
  const stepsId = useId();

  useEffect(() => {
    setHint(installHint(navigator.userAgent, isRunningInstalled()));
  }, []);

  if (installed || hint === 'none') return null;

  const copy = COPY[hint];

  return (
    <li className="border-b border-hairline px-1 py-3">
      <p className="text-sm font-medium text-ink">Install Bilikha</p>
      <p className="mt-0.5 text-sm text-ink-muted">
        Open it from your {copy.noun} like any other app, without the browser around
        it. It still needs internet.
      </p>

      {canInstall ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => void install()}
        >
          Install
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3"
          aria-expanded={open}
          aria-controls={stepsId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Hide' : 'How to install'}
        </Button>
      )}

      {/* `declined` clears itself when the browser offers again, so the
          button and this fallback are never both on screen. */}
      {(open || (declined && !canInstall)) && (
        <p id={stepsId} className="mt-3 max-w-prose text-sm text-ink-muted">
          {copy.steps}
        </p>
      )}
    </li>
  );
}
