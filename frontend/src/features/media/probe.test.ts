import { describe, expect, it } from 'vitest';
import { codecFromMp4Bytes } from './probe';

/** A box: 4-byte big-endian size, 4-byte type, then its body. */
function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const bodyLength = children.reduce((sum, child) => sum + child.length, 0);
  const bytes = new Uint8Array(8 + bodyLength);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  for (let i = 0; i < 4; i += 1) bytes[4 + i] = type.charCodeAt(i);
  let offset = 8;
  for (const child of children) {
    bytes.set(child, offset);
    offset += child.length;
  }
  return bytes;
}

function raw(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

/** stsd is a full box: version and flags, an entry count, then one sample entry. */
function stsd(codec: string): Uint8Array {
  return box('stsd', raw(0, 0, 0, 0), raw(0, 0, 0, 1), box(codec, new Uint8Array(16)));
}

function track(codec: string): Uint8Array {
  return box('trak', box('tkhd', new Uint8Array(12)), box('mdia', box('minf', box('stbl', stsd(codec)))));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

const ftyp = box('ftyp', raw(0x69, 0x73, 0x6f, 0x6d));

describe('codecFromMp4Bytes', () => {
  it('reads H.264 from the sample description', () => {
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('avc1'))))).toBe('avc1');
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('avc3'))))).toBe('avc3');
  });

  it('reads HEVC', () => {
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('hvc1'))))).toBe('hvc1');
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('hev1'))))).toBe('hev1');
  });

  it('skips the audio track to find the video one', () => {
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('mp4a'), track('hvc1'))))).toBe('hvc1');
  });

  it('finds moov after a media data box', () => {
    expect(codecFromMp4Bytes(concat(ftyp, box('mdat', new Uint8Array(64)), box('moov', track('avc1'))))).toBe('avc1');
  });

  it('answers webm for an EBML header', () => {
    expect(codecFromMp4Bytes(raw(0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00))).toBe('webm');
  });

  it('answers unknown for no video track, truncated bytes or noise', () => {
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('mp4a'))))).toBe('unknown');
    expect(codecFromMp4Bytes(concat(ftyp, box('moov', track('avc1'))).slice(0, 40))).toBe('unknown');
    expect(codecFromMp4Bytes(raw(0, 0, 0, 3, 1, 2, 3))).toBe('unknown');
    expect(codecFromMp4Bytes(new Uint8Array(0))).toBe('unknown');
  });
});
