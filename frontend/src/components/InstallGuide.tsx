import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui';
import { installHint, isRunningInstalled, type InstallHint } from '@/lib/install';

/**
 * A row in the account hub's Settings group: what installing gets you, and a
 * button that says where the browser keeps the control that does it.
 *
 * It cannot install anything itself — that needs `beforeinstallprompt`, which
 * Chrome only fires for sites with a service worker, and there is none by
 * design (plan 0036 phase 1). The first version said so in three paragraphs at
 * the foot of the page and read as an afterthought beside the tidy rows above
 * it. This one is shaped like Mode and Appearance, because it is the same kind
 * of thing: a choice about this device.
 *
 * The button reveals rather than installs, so it says `How to install` and not
 * `Install`. A button that does not do what its label promises is worse than no
 * button, and worse than a sentence.
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
  // Resolved after mount: both inputs are browser state, and guessing would
  // render instructions for the wrong device.
  const [hint, setHint] = useState<InstallHint>('none');
  const [open, setOpen] = useState(false);
  const stepsId = useId();

  useEffect(() => {
    setHint(installHint(navigator.userAgent, isRunningInstalled()));
  }, []);

  if (hint === 'none') return null;

  const copy = COPY[hint];

  return (
    <li className="border-b border-hairline px-1 py-3">
      <p className="text-sm font-medium text-ink">Install Bilikha</p>
      <p className="mt-0.5 text-sm text-ink-muted">
        Open it from your {copy.noun} like any other app, without the browser around
        it. It still needs internet.
      </p>

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

      {open && (
        <p id={stepsId} className="mt-3 max-w-prose text-sm text-ink-muted">
          {copy.steps}
        </p>
      )}
    </li>
  );
}
