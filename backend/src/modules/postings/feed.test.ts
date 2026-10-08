import { describe, expect, it } from 'vitest';
import { db } from '../../db/index.js';
import { messages } from '../../db/schema/index.js';
import { listFeedPostings } from './postings.service.js';
import { makeConversation, makeCreative, makePosting, makeUser } from '../../test/factories.js';

describe('the creative feed', () => {
  const page = { page: 1, limit: 50 };

  it('counts replies per creative, not per message', async () => {
    const client = await makeUser();
    const viewer = await makeCreative();
    const first = await makeCreative();
    const second = await makeCreative();
    const posting = await makePosting(client.id);
    const quiet = await makePosting(client.id);

    // The first creative replies twice in one thread; that is still one reply.
    const a = await makeConversation(client.id, first.profile);
    const b = await makeConversation(client.id, second.profile);
    await db.insert(messages).values([
      { conversationId: a.id, senderUserId: first.user.id, body: 'Hello', postingId: posting.id },
      { conversationId: a.id, senderUserId: first.user.id, body: 'Again', postingId: posting.id },
      { conversationId: b.id, senderUserId: second.user.id, body: 'Hi', postingId: posting.id },
    ]);

    const feed = await listFeedPostings(viewer.user.id, page);
    const byId = new Map(feed.data.map((row) => [row.id, row]));

    expect(byId.get(posting.id)?.replyCount).toBe(2);
    expect(byId.get(quiet.id)?.replyCount).toBe(0);
    expect(byId.get(posting.id)?.hasReplied).toBe(false);
  });
});
