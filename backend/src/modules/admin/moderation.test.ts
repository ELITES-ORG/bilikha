import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creativeProfiles, moderationActions } from '../../db/schema/index.js';
import { moderate, setAccountStatus } from './admin.service.js';
import { makeAdmin, makeCreative, makeUser } from '../../test/factories.js';

describe('moderation transitions', () => {
  it('approve publishes and writes its audit row', async () => {
    const admin = await makeAdmin();
    const { profile } = await makeCreative({ profile: { status: 'pending_review' } });

    await moderate({ profileId: profile.id, adminId: admin.id, action: 'approved' });

    const [row] = await db.select().from(creativeProfiles).where(eq(creativeProfiles.id, profile.id));
    expect(row?.status).toBe('published');
    expect(row?.reviewedBy).toBe(admin.id);

    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.profileId, profile.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('approved');
  });

  it('reject requires a reason', async () => {
    const admin = await makeAdmin();
    const { profile } = await makeCreative({ profile: { status: 'pending_review' } });

    await expect(
      moderate({ profileId: profile.id, adminId: admin.id, action: 'rejected' }),
    ).rejects.toThrow();

    const [row] = await db.select().from(creativeProfiles).where(eq(creativeProfiles.id, profile.id));
    expect(row?.status).toBe('pending_review');
  });

  it('reject records the reason the registrant will read', async () => {
    const admin = await makeAdmin();
    const { profile } = await makeCreative({ profile: { status: 'pending_review' } });

    await moderate({
      profileId: profile.id,
      adminId: admin.id,
      action: 'rejected',
      reason: 'The bio is empty.',
    });

    const [row] = await db.select().from(creativeProfiles).where(eq(creativeProfiles.id, profile.id));
    expect(row?.status).toBe('suspended');
    expect(row?.rejectionReason).toBe('The bio is empty.');
  });

  it('acknowledging an edit clears the flag without changing status', async () => {
    const admin = await makeAdmin();
    const { profile } = await makeCreative({
      profile: { status: 'published', editedSinceReviewAt: new Date() },
    });

    await moderate({ profileId: profile.id, adminId: admin.id, action: 'acknowledged_edit' });

    const [row] = await db.select().from(creativeProfiles).where(eq(creativeProfiles.id, profile.id));
    expect(row?.status).toBe('published');
    expect(row?.editedSinceReviewAt).toBeNull();
  });

  it('refuses to moderate a profile that does not exist', async () => {
    const admin = await makeAdmin();
    await expect(
      moderate({
        profileId: '00000000-0000-0000-0000-000000000000',
        adminId: admin.id,
        action: 'approved',
      }),
    ).rejects.toThrow();
  });
});

describe('account suspension', () => {
  it('suspends an ordinary account and records it against the person', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    await setAccountStatus({
      adminId: admin.id,
      userId: target.id,
      action: 'suspend',
      reason: 'Repeated abuse.',
    });

    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.subjectUserId, target.id));
    expect(audit[0]?.action).toBe('account_suspended');
  });

  it('refuses to suspend the administrator doing it', async () => {
    const admin = await makeAdmin();
    await expect(
      setAccountStatus({ adminId: admin.id, userId: admin.id, action: 'suspend', reason: 'x' }),
    ).rejects.toThrow();
  });

  it('refuses to suspend another administrator', async () => {
    const admin = await makeAdmin();
    const other = await makeAdmin();
    await expect(
      setAccountStatus({ adminId: admin.id, userId: other.id, action: 'suspend', reason: 'x' }),
    ).rejects.toThrow();
  });

  it('reinstates', async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    await setAccountStatus({ adminId: admin.id, userId: target.id, action: 'suspend', reason: 'x' });
    await setAccountStatus({ adminId: admin.id, userId: target.id, action: 'reinstate' });

    const audit = await db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.subjectUserId, target.id));
    expect(audit.map((a) => a.action)).toEqual(['account_suspended', 'account_reinstated']);
  });
});
