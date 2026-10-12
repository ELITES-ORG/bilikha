/**
 * File signatures (ADR 0046): the first bytes of a stored object must match its
 * stored type, so a file renamed or relabelled before upload is refused when it
 * is attached.
 */
const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

function at(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return (
    bytes.length >= offset + expected.length && expected.every((value, index) => bytes[offset + index] === value)
  );
}

export function matchesSignature(mimeType: string, bytes: Uint8Array): boolean {
  switch (mimeType) {
    case 'image/webp':
      return at(bytes, 0, ascii('RIFF')) && at(bytes, 8, ascii('WEBP'));
    case 'image/jpeg':
      return at(bytes, 0, [0xff, 0xd8, 0xff]);
    case 'audio/mpeg':
      return at(bytes, 0, ascii('ID3')) || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
    case 'audio/aac':
      return at(bytes, 0, [0xff, 0xf1]) || at(bytes, 0, [0xff, 0xf9]);
    case 'audio/mp4':
    case 'video/mp4':
      return at(bytes, 4, ascii('ftyp'));
    case 'audio/ogg':
      return at(bytes, 0, ascii('OggS'));
    case 'video/webm':
      return at(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'application/pdf':
      return at(bytes, 0, ascii('%PDF-'));
    default:
      return false;
  }
}
