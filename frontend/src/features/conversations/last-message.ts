import type { ConversationListItem } from '@contracts/conversations';
import type { MediaKind } from '@contracts/media';
import type { MessageKey } from '@/i18n/catalogs/en';
import { fill } from '@/i18n/fill';

const SENT: Readonly<Record<MediaKind, MessageKey>> = {
  image: 'conversations.sent.image',
  audio: 'conversations.sent.audio',
  video: 'conversations.sent.video',
  document: 'conversations.sent.document',
};

/**
 * The inbox's line for a last message: its text, or, for one that is only
 * files, what was sent ("Sent a photo", "Sent 3 files"). ADR 0060.
 */
export function lastMessagePreview(
  message: Pick<NonNullable<ConversationListItem['lastMessage']>, 'body' | 'attachmentKinds'>,
  t: (key: MessageKey) => string,
): string {
  if (message.body) return message.body;
  const kinds = message.attachmentKinds ?? [];
  if (kinds.length === 1) return t(SENT[kinds[0]!]);
  if (kinds.length > 1) return fill(t('conversations.sent.files'), { count: String(kinds.length) });
  return '';
}
