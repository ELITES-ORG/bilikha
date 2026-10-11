import { useState } from 'react';
import { useAdminSummary } from '@/features/admin/api';
import { Container, TabPanels, Tabs } from '@/components/ui';
import { AdminPageHeader, AdminTabLabel, AdminToolbar, adminTabsClass } from './admin-ui';
import { ContentReviewList } from './content-review/ContentReviewList';

type OfferTab = 'new' | 'edit';

const TABS: Array<{ value: OfferTab; label: string }> = [
  { value: 'new', label: 'New offers' },
  { value: 'edit', label: 'Changes' },
];

/**
 * Every offer decision in one place (ADR 0059): a new offer before anyone sees
 * it, and a change to a published one, which waits beside what is public
 * (ADR 0058).
 */
export function AdminOffersPage() {
  const [tab, setTab] = useState<OfferTab>('new');
  const summary = useAdminSummary();
  const counts = { new: summary.data?.offers.new, edit: summary.data?.offers.changes };

  return (
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="Offers"
        description="Nothing here is public yet. Approve a new offer to put it on the directory, or a change to replace what is public. Reject either with a reason its creative sees — a rejected change leaves the public offer as it was."
      />

      <AdminToolbar ruled={false}>
        <Tabs
          label="Offers waiting"
          idPrefix="offers"
          className={adminTabsClass}
          value={tab}
          onChange={setTab}
          items={TABS.map((item) => ({
            value: item.value,
            label: <AdminTabLabel text={item.label} count={counts[item.value]} active={tab === item.value} />,
          }))}
        />
      </AdminToolbar>

      <TabPanels idPrefix="offers" values={TABS.map((item) => item.value)} value={tab} className="mt-8">
        {tab === 'new' ? (
          <ContentReviewList
            key="new"
            kind="offer"
            change="new"
            searchLabel="Search new offers"
            searchPlaceholder="Search by creative, title or sub-domain"
            empty={{
              title: 'No new offers waiting',
              description: 'A creative’s new offer appears here before anyone else can see it.',
            }}
          />
        ) : (
          <ContentReviewList
            key="edit"
            kind="offer"
            change="edit"
            searchLabel="Search offer changes"
            searchPlaceholder="Search by creative, title or sub-domain"
            empty={{
              title: 'No changes waiting',
              description: 'An edit to a published offer, or a photo added or removed, appears here. The public keeps seeing the approved version until you decide.',
            }}
          />
        )}
      </TabPanels>
    </Container>
  );
}
