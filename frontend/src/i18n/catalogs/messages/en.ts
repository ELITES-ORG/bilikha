/**
 * Files in a conversation, in English (ADR 0055, ADR 0060).
 *
 * Kept out of `../en.ts` because only the conversation page reads these
 * strings, and it is a lazy route: they travel in its chunk. `./index.ts`
 * registers this section, `features/conversations/attachments/` imports it,
 * and the route waits for it with `withSection('messages')`.
 *
 * `{name}` placeholders are filled by the component; keep each sentence whole
 * so a translator can move the placeholder.
 *
 * Adding a key here means adding it to `fil.ts` and `war.ts` beside this file
 * with an empty value. `catalogs.test.ts` fails if you forget.
 */
export const enMessages = {
  // The composer's attach tray
  'messages.files.attach': 'Attach files',
  'messages.files.closeTray': 'Close attach files',
  'messages.files.choose': 'Choose files',
  'messages.files.limits':
    'Up to {count} files a message · Photos up to {image} · Audio up to {audioSize} and {audioLength} · Video up to {videoSize} and {videoLength} · PDF up to {pdf}',
  'messages.files.kept': 'Photos, audio and video are kept for 30 days, then removed. PDFs are kept.',
  'messages.files.preparing': 'Preparing {name}',
  'messages.files.uploading': 'Uploading {name}',
  'messages.files.progress': '{sent} of {total} · {percent}%',
  'messages.files.ready': '{name} · ready to send',
  'messages.files.cancel': 'Cancel',
  'messages.files.remove': 'Remove',
  'messages.files.leaveWarning': 'A file is still uploading.',
  'messages.files.waitForUploads': 'Wait for the files to finish uploading.',

  // Refused before a byte is sent, or by the API
  'messages.files.refused.type':
    'This file type can’t be sent. Use a photo, MP3, M4A or OGG audio, MP4 or WebM video, or a PDF.',
  'messages.files.refused.size': 'This file is {size}. This kind can be up to {limit}.',
  'messages.files.refused.duration': 'This recording is {length} long. This kind can be up to {limit}.',
  'messages.files.refused.codec':
    'This video uses a format many phones can’t play. Export it as MP4 (H.264) and try again.',
  'messages.files.refused.unreadable': 'This file couldn’t be read. Try another copy.',
  'messages.files.refused.full': 'A message can carry at most {count} files.',
  'messages.files.failed': 'The upload stopped. Try again.',
  'messages.files.resend': 'A file couldn’t be sent. Remove it and add it again.',

  // A file in the thread
  'messages.files.kind.image': 'Photo',
  'messages.files.kind.audio': 'Audio',
  'messages.files.kind.video': 'Video',
  'messages.files.kind.document': 'PDF',
  'messages.files.viewPhoto': 'View photo',
  'messages.files.closePhoto': 'Close photo',
  'messages.files.play': 'Play',
  'messages.files.open': 'Open',
  'messages.files.download': 'Download',
  'messages.files.until': 'Available until {date}',
  'messages.files.expired.image': 'This photo expired on {date}.',
  'messages.files.expired.audio': 'This audio expired on {date}.',
  'messages.files.expired.video': 'This video expired on {date}.',
  'messages.files.expired.document': 'This PDF is no longer available.',
  'messages.files.unavailable': 'This file couldn’t be opened. Try again.',
} as const;

export type MessagesKey = keyof typeof enMessages;
