import { useEffect, useState } from 'react';
import { installHint, isRunningInstalled, type InstallHint } from '@/lib/install';

/**
 * Tells somebody where their browser keeps the button that installs Bilikha.
 *
 * It cannot install anything itself — that needs `beforeinstallprompt`, which
 * Chrome only fires for sites with a service worker, and there is none by
 * design (plan 0036 phase 1). So this is a signpost, and it is written like
 * one: no "install prompt", no "PWA", no "home screen shortcut". Just where to
 * tap and what happens after.
 *
 * It disappears once the app is installed, and never appears in a browser that
 * cannot install, because instructions for a menu item that is not there send
 * someone hunting through settings for nothing.
 */

const COPY: Record<Exclude<InstallHint, 'none'>, { where: string; then: string }> = {
  ios: {
    where: 'Tap the Share button at the bottom of the screen',
    then: 'scroll down and choose Add to Home Screen.',
  },
  android: {
    where: 'Tap the ⋮ button at the top right of your browser',
    then: 'then choose Install app.',
  },
  desktop: {
    where: 'Click the install icon at the right-hand end of the address bar',
    then: 'where the web address is shown, at the top of this window.',
  },
};

export function InstallGuide() {
  // Resolved after mount: both inputs are browser state, and guessing on the
  // server would render advice for the wrong device.
  const [hint, setHint] = useState<InstallHint>('none');

  useEffect(() => {
    setHint(installHint(navigator.userAgent, isRunningInstalled()));
  }, []);

  if (hint === 'none') return null;

  const copy = COPY[hint];

  return (
    <section className="mt-10" aria-labelledby="install-heading">
      <h2 id="install-heading" className="u-eyebrow px-1">
        Bilikha on your {hint === 'desktop' ? 'computer' : 'phone'}
      </h2>
      <div className="mt-3 border-t border-hairline pt-4">
        <p className="max-w-prose text-md text-ink">
          You can add Bilikha to your{' '}
          {hint === 'desktop' ? 'computer' : 'home screen'} and open it like any
          other app, without the browser around it.
        </p>
        <p className="mt-2 max-w-prose text-md text-ink-muted">
          {copy.where}, {copy.then}
        </p>
        <p className="mt-2 max-w-prose text-sm text-ink-subtle">
          It still needs internet to work, and it is the same Bilikha — your
          account, messages and work stay exactly as they are.
        </p>
      </div>
    </section>
  );
}
