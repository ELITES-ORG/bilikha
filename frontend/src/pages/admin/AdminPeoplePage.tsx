import { Container } from '@/components/ui';
import { AdminPageHeader, AdminSection } from './admin-ui';
import { ContentReviewList } from './content-review/ContentReviewList';
import { IdCheckQueue } from './IdCheckQueue';

/**
 * Decisions about a person rather than their work (ADR 0059): a new account's
 * ID (plan 0053) and a new profile photo, for clients and creatives alike —
 * both ask whether someone is who they say they are.
 */
export function AdminPeoplePage() {
  return (
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="People"
        description="Who people are: the ID a new account registers with, and the photo people use to represent themselves."
      />

      <AdminSection
        title="ID checks"
        description="Check each new account's ID against what they registered with: a Biliran address or issuer, and 18 or older. Until you verify it, the account can only browse. Every time you open an ID it is recorded against you."
      >
        <IdCheckQueue />
      </AdminSection>

      <AdminSection
        title="Profile photos"
        description="A new photo is seen only by its owner until you approve it. Approve it to show it on their profile and messages; reject it with a reason they see, and their approved photo, or their initials, stays."
      >
        <ContentReviewList
          kind="avatar"
          searchLabel="Search profile photos"
          searchPlaceholder="Search by name"
          empty={{
            title: 'No photos waiting',
            description: 'A new profile photo appears here before anyone else can see it.',
          }}
        />
      </AdminSection>
    </Container>
  );
}
