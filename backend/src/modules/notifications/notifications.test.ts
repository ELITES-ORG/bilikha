import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { notifications, users } from '../../db/schema/index.js';
import { moderate } from '../admin/admin.service.js';
import {
  listNotifications,
  markRead,
  notify,
  notifyOnce,
  unreadCount,
} from './notifications.service.js';
import { makeAdmin, makeCreative, makeUser, reinstate, suspend } from '../../test/factories.js';

/**
 * These were verified once by a script that was written, run, and deleted.
 * This is that script, kept.
 */
describe('notifications', () => {
  it('tells the profile owner when it is approved, and not the admin', async () => {
    const admin = await makeAdmin();
    const { user, profile } = await makeCreative({ profile: { status: 'pending_review' } });

    await moderate({ profileId: profile.id, adminId: admin.id, action: 'approved' });

    expect(await unreadCount(user.id)).toBe(1);
    expect(await unreadCount(admin.id)).toBe(0);

    const { data } = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(data[0]?.type).toBe('profile_approved');
    expect(data[0]?.link).toBe(`/creatives/${profile.slug}`);
  });

  it('tells the owner when it is rejected', async () => {
    const admin = await makeAdmin();
    const { user, profile } = await makeCreative({ profile: { status: 'pending_review' } });

    await moderate({
      profileId: profile.id,
      adminId: admin.id,
      action: 'rejected',
      reason: 'Needs a clearer bio.',
    });

    const { data } = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(data[0]?.type).toBe('profile_rejected');
  });

  it('never notifies someone of their own action', async () => {
    const person = await makeUser();
    const { profile } = await makeCreative();

    await notify({
      userId: person.id,
      actorUserId: person.id,
      type: 'profile_approved',
      targetId: profile.id,
    });

    expect(await unreadCount(person.id)).toBe(0);
  });

  it('hides a suspended actor without dropping the notification', async () => {
    const admin = await makeAdmin();
    const { user, profile } = await makeCreative({ profile: { status: 'pending_review' } });
    await moderate({ profileId: profile.id, adminId: admin.id, action: 'approved' });

    const visible = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(visible.data[0]?.actor).not.toBeNull();

    await suspend(admin.id);
    const hidden = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(hidden.data).toHaveLength(1);
    expect(hidden.data[0]?.actor).toBeNull();

    await reinstate(admin.id);
    const back = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(back.data[0]?.actor).not.toBeNull();
  });

  it('tombstones a target that no longer resolves', async () => {
    const admin = await makeAdmin();
    const { user, profile } = await makeCreative({ profile: { status: 'pending_review' } });
    await moderate({ profileId: profile.id, adminId: admin.id, action: 'approved' });

    await db
      .update(notifications)
      .set({ targetId: '00000000-0000-0000-0000-000000000000' })
      .where(eq(notifications.userId, user.id));

    const { data } = await listNotifications(user.id, { page: 1, limit: 10 });
    expect(data).toHaveLength(1);
    expect(data[0]?.link).toBeNull();
    expect(data[0]?.detail).toBe('This is no longer available.');
  });

  it('will not let one person mark another’s notification read', async () => {
    const admin = await makeAdmin();
    const stranger = await makeUser();
    const { user, profile } = await makeCreative({ profile: { status: 'pending_review' } });
    await moderate({ profileId: profile.id, adminId: admin.id, action: 'approved' });

    const { data } = await listNotifications(user.id, { page: 1, limit: 10 });
    await markRead(stranger.id, data[0]!.id);

    expect(await unreadCount(user.id)).toBe(1);

    await markRead(user.id, data[0]!.id);
    expect(await unreadCount(user.id)).toBe(0);
  });

  it('collapses repeats while unread, and allows a new one after reading', async () => {
    const actor = await makeUser();
    const recipient = await makeUser();
    const { profile } = await makeCreative();

    await notifyOnce({ userId: recipient.id, actorUserId: actor.id, type: 'posting_replied', targetId: profile.id });
    await notifyOnce({ userId: recipient.id, actorUserId: actor.id, type: 'posting_replied', targetId: profile.id });
    await notifyOnce({ userId: recipient.id, actorUserId: actor.id, type: 'posting_replied', targetId: profile.id });
    expect(await unreadCount(recipient.id)).toBe(1);

    const { data } = await listNotifications(recipient.id, { page: 1, limit: 10 });
    await markRead(recipient.id, data[0]!.id);

    await notifyOnce({ userId: recipient.id, actorUserId: actor.id, type: 'posting_replied', targetId: profile.id });
    expect(await unreadCount(recipient.id)).toBe(1);
  });

  it('does not fail the thing that caused it', async () => {
    // A notification is a side effect. If writing it throws, the moderation
    // decision it followed must still stand.
    const ghost = '00000000-0000-0000-0000-000000000009';
    const { profile } = await makeCreative();

    await expect(
      notify({ userId: ghost, type: 'profile_approved', targetId: profile.id }),
    ).resolves.toBeUndefined();

    const [rows] = await db.select({ value: count() }).from(notifications);
    expect(rows?.value).toBe(0);
  });

  it('removes notifications when the recipient is deleted', async () => {
    const admin = await makeAdmin();
    const { user, profile } = await makeCreative({ profile: { status: 'pending_review' } });
    await moderate({ profileId: profile.id, adminId: admin.id, action: 'approved' });

    await db.delete(users).where(eq(users.id, user.id));

    const [rows] = await db.select({ value: count() }).from(notifications);
    expect(rows?.value).toBe(0);
  });
});
