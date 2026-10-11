import { Container } from '@/components/ui';
import { AdminPageHeader, AdminSection } from './admin-ui';
import { ContentReviewList } from './content-review/ContentReviewList';

/**
 * Decisions about a person rather than their work (ADR 0059): a new profile
 * photo, for clients and creatives alike. ID checks join it here (plan 0053
 * Phase 3), because both ask whether someone is who they say they are.
 */
export function AdminPeoplePage() {
  return (
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="People"
        description="Photos people use to represent themselves. A new one is seen only by its owner until you approve it; the approved photo, or their initials, stays in its place until then."
      />

      <AdminSection
        title="Profile photos"
        description="Approve a photo to show it on the person's profile and messages. Reject it with a reason they see; their approved photo stays."
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
