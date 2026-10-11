import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useVerificationGate } from './useVerificationGate';

/**
 * Said in place of an action a browse-only account cannot take (ADR 0057), so
 * the screen explains itself instead of failing on a 403. The pinned banner
 * says why; this says it here.
 */
export function BrowseOnlyNote({ className }: { className?: string }) {
  const { explain } = useVerificationGate();
  return (
    <p
      role="note"
      className={cn(
        'flex items-start gap-2 rounded-sm border border-hairline bg-slate-50 px-4 py-3 text-sm text-ink-muted',
        className,
      )}
    >
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span lang={explain.lang}>{explain.text}</span>
    </p>
  );
}
