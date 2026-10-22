import { useEffect, useRef, useState } from 'react';
import type { MediaKind } from '@contracts/media';
import { checkBeforeUpload, classifyFile } from '@/features/media/checks';
import { abandonUploadTicket, requestUploadTicket } from '@/features/media/limits-api';
import { readDuration, videoCodec } from '@/features/media/probe';
import { isAbort, transferFile } from '@/features/media/transfer';
import { initialUploadState, uploadReducer, type UploadEvent, type UploadState } from '@/features/media/upload-machine';
import '@/i18n/catalogs/messages';
import { useT } from '@/i18n/i18n-context';
import {
  refusalSentence,
  uploadFailureSentence,
  type MessageFileLimits,
} from './message-files';

/**
 * A message's files while it is being written (ADR 0060). Each picked file is
 * checked before a byte is sent, then sent straight to storage beside the
 * others. Once every byte is there it waits, in the upload machine's
 * `confirming` state, for the message: sending the message is what attaches
 * it. A file removed, or the page left, gives its reservation back.
 */

export interface PendingFile {
  key: number;
  name: string;
  kind: MediaKind;
  state: UploadState;
  /** Set once the API has reserved room for it. */
  reservationId: string | null;
}

export function useMessageUploads(conversationId: string, limits: MessageFileLimits | null) {
  const t = useT();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // From lg the page stays mounted when another thread is opened: start that one empty.
  const [owner, setOwner] = useState(conversationId);
  if (owner !== conversationId) {
    setOwner(conversationId);
    setFiles([]);
    setNotice(null);
  }
  const nextKey = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const reservations = useRef(new Map<number, string>());

  const busy = files.some((file) => file.state.status === 'checking' || file.state.status === 'uploading');
  const ready = files.filter((file) => file.state.status === 'confirming');

  useEffect(() => {
    if (!busy) return;
    const warning = t('messages.files.leaveWarning');
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = warning;
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [busy, t]);

  // Leaving the conversation stops what it started and gives back what was not sent.
  useEffect(() => {
    const running = controllers.current;
    const held = reservations.current;
    return () => {
      for (const controller of running.values()) controller.abort();
      for (const reservationId of held.values()) void abandonUploadTicket(reservationId).catch(() => undefined);
      running.clear();
      held.clear();
    };
  }, [conversationId]);

  function update(key: number, event: UploadEvent) {
    setFiles((current) =>
      current.map((file) => (file.key === key ? { ...file, state: uploadReducer(file.state, event) } : file)),
    );
  }

  function drop(key: number, { giveBack }: { giveBack: boolean }) {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    const reservationId = reservations.current.get(key);
    reservations.current.delete(key);
    if (giveBack && reservationId) void abandonUploadTicket(reservationId).catch(() => undefined);
    setFiles((current) => current.filter((file) => file.key !== key));
  }

  async function start(file: File, kind: MediaKind, durationSeconds: number | null) {
    const key = nextKey.current++;
    const controller = new AbortController();
    controllers.current.set(key, controller);
    setFiles((current) => [...current, { key, name: file.name, kind, state: initialUploadState, reservationId: null }]);

    try {
      await transferFile(file, kind, durationSeconds, {
        requestTicket: (body) => requestUploadTicket({ destination: 'message', conversationId, ...body }),
        onEvent: (event) => {
          if (event.type === 'ticket') {
            reservations.current.set(key, event.reservationId);
            setFiles((current) =>
              current.map((item) => (item.key === key ? { ...item, reservationId: event.reservationId } : item)),
            );
          } else if (event.type !== 'prepared') {
            update(key, event);
          }
        },
        signal: controller.signal,
      });
      controllers.current.delete(key);
      update(key, { type: 'transferred' });
    } catch (error) {
      if (!isAbort(error) && !controller.signal.aborted) {
        setNotice(uploadFailureSentence(error, limits?.filesPerMessage ?? 0, t));
      }
      drop(key, { giveBack: true });
    }
  }

  /** Checks each picked file and starts the ones that pass, up to the message's limit. */
  async function add(picked: readonly File[]) {
    if (!limits || picked.length === 0) return;
    setNotice(null);
    let room = limits.filesPerMessage - files.length;
    for (const file of picked) {
      if (room <= 0) {
        setNotice(refusalSentence('full', { limit: limits.filesPerMessage }, t));
        return;
      }
      const kind = classifyFile(file);
      const limit = kind ? limits.kinds[kind] : null;
      if (!kind || !limit?.enabled) {
        setNotice(refusalSentence('type', {}, t));
        continue;
      }
      const timed = kind === 'audio' || kind === 'video';
      const durationSeconds = timed ? await readDuration(file) : null;
      const codec = kind === 'video' ? await videoCodec(file) : null;
      const check = checkBeforeUpload(file, kind, limit, { durationSeconds, codec });
      if (!check.ok) {
        setNotice(refusalSentence(check.reason, { sizeBytes: file.size, durationSeconds, limit: check.limit }, t));
        continue;
      }
      room -= 1;
      void start(file, kind, durationSeconds);
    }
  }

  return {
    files,
    notice,
    busy,
    /** The reservations to send with the message. */
    readyIds: ready.map((file) => file.reservationId).filter((id): id is string => id !== null),
    add,
    /** Cancel an upload, or take a finished file off the message. */
    remove: (key: number) => drop(key, { giveBack: true }),
    /** The message went: its files are attached, so nothing is given back. */
    sent() {
      for (const file of ready) drop(file.key, { giveBack: false });
      setNotice(null);
    },
    /** The message was refused for its files: drop them, and say to add them again. */
    refused() {
      for (const file of ready) drop(file.key, { giveBack: true });
      setNotice(t('messages.files.resend'));
    },
    /** What stops the message going while files are still on their way, or null. */
    blockingReason: () => (busy ? t('messages.files.waitForUploads') : null),
  };
}

export type MessageUploads = ReturnType<typeof useMessageUploads>;
