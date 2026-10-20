import { FileText, Film, Image, Music } from 'lucide-react';
import type { MediaKind } from '@contracts/media';

/** One icon per kind of file, in the composer and the thread alike. */
export const KIND_ICONS: Readonly<Record<MediaKind, typeof Image>> = {
  image: Image,
  audio: Music,
  video: Film,
  document: FileText,
};
