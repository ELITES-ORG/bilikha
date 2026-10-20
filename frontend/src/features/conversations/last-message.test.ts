import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from '@/i18n/catalogs/en';
import { lastMessagePreview } from './last-message';

const t = (key: MessageKey) => (en as Readonly<Record<string, string>>)[key] ?? key;

describe('lastMessagePreview', () => {
  it("shows a message's text, even when it carries files", () => {
    expect(lastMessagePreview({ body: 'Here is the draft', attachmentKinds: ['image'] }, t)).toBe('Here is the draft');
  });

  it('says what was sent when a message is only files', () => {
    expect(lastMessagePreview({ body: '', attachmentKinds: ['image'] }, t)).toBe('Sent a photo');
    expect(lastMessagePreview({ body: '', attachmentKinds: ['audio'] }, t)).toBe('Sent an audio clip');
    expect(lastMessagePreview({ body: '', attachmentKinds: ['video'] }, t)).toBe('Sent a video');
    expect(lastMessagePreview({ body: '', attachmentKinds: ['document'] }, t)).toBe('Sent a PDF');
    expect(lastMessagePreview({ body: '', attachmentKinds: ['image', 'document', 'image'] }, t)).toBe('Sent 3 files');
  });
});
