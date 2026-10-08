import elitesWordmark from '@/assets/elites-wordmark.webp';
import { GlitchImage } from '@/components/GlitchImage';
import { cn } from '@/lib/cn';
import { LEGAL_OPERATOR } from '@/lib/legal';

const RA_11904_URL = 'https://lawphil.net/statutes/repacts/ra2022/ra_11904_2022.html';

const externalLink = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Who runs Bilikha, what its domains follow, and who builds it. `mapCredit`
 * adds the OpenStreetMap line, which the ODbL requires wherever the map's
 * coastline is shown — and only there.
 */
export function CreditsBar({ mapCredit = false, className }: { mapCredit?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 text-xs text-ink-subtle sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-ink-muted">
          © {new Date().getFullYear()} {LEGAL_OPERATOR}
        </p>
        <p>
          <span className="block sm:inline">
            Creative domains follow{' '}
            <a href={RA_11904_URL} {...externalLink} className="u-tap link-underline">
              RA 11904
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </span>
          {mapCredit && (
            <>
              <span className="hidden sm:inline" aria-hidden="true">
                {' · '}
              </span>
              <span className="mt-1 block sm:mt-0 sm:inline">
                Map data ©{' '}
                <a href="https://www.openstreetmap.org/copyright" {...externalLink} className="u-tap link-underline">
                  OpenStreetMap contributors
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </span>
            </>
          )}
        </p>
      </div>
      <p className="flex items-center gap-1.5">
        Developed and maintained by
        <a href="https://elitesys.org" {...externalLink} className="u-tap inline-flex transition-opacity hover:opacity-80">
          <GlitchImage src={elitesWordmark} alt="Elites" width={229} height={48} className="h-4" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </div>
  );
}
