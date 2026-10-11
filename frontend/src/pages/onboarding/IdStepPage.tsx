import '@/i18n/catalogs/verification';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Camera, CircleCheck, ImageUp, ShieldCheck } from 'lucide-react';
import type { IdType } from '@contracts/verification';
import { Button, Container, Eyebrow, Select } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { uploadImage } from '@/features/media/api';
import { requestIdUploadUrl, useSubmitId } from '@/features/verification/api';
import { ID_TYPE_OPTIONS, idTypeOption, type IdTypeGroup } from '@/features/verification/id-types';
import { needsIdStep } from '@/features/verification/status';
import { useI18n, type ResolvedMessage } from '@/i18n/i18n-context';
import { ApiError } from '@/lib/api-client';
import { ID_EDGE, resizeImage } from '@/lib/image';
import { safeReturnPath } from '@/lib/return-path';

type Side = 'front' | 'back';

type SideState =
  | { state: 'empty' }
  | { state: 'uploading' }
  | { state: 'done'; key: string; previewUrl: string }
  | { state: 'error'; message: string };

const EMPTY: SideState = { state: 'empty' };

/**
 * The ID step (ADR 0057, plan 0053 Step 2.5): a new account sends a photo of a
 * Biliran ID, and the same page takes it again after *try again*.
 *
 * The consent sentence comes first, and the photo controls stay disabled until
 * it is agreed to: no ID image is taken before the person has read who sees it
 * and when it is deleted.
 */
export function IdStepPage() {
  const { message } = useI18n();
  const { data: user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const next = safeReturnPath(searchParams.get('next'), '/directory');
  const submit = useSubmitId();

  const [consent, setConsent] = useState(false);
  const [idType, setIdType] = useState<IdType | ''>('');
  const [sides, setSides] = useState<Record<Side, SideState>>({ front: EMPTY, back: EMPTY });
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Object URLs for the previews are released when replaced and on leaving.
  const previews = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Nothing owed — no verification, already sent, or verified: move on. This is
  // also how a successful submission leaves, once the session is updated.
  if (user && !needsIdStep(user)) return <Navigate to={next} replace />;

  const option = idTypeOption(idType || null);
  const needsBack = option?.hasBack ?? false;
  const declined = user?.idVerification?.status === 'declined_retry';
  const ready =
    consent
    && Boolean(option)
    && sides.front.state === 'done'
    && (!needsBack || sides.back.state === 'done');

  function setSide(side: Side, value: SideState) {
    // Release the preview this replaces. Outside the updater, which React may
    // run twice; revoking a URL already revoked is harmless.
    const previous = sides[side];
    if (previous.state === 'done') {
      URL.revokeObjectURL(previous.previewUrl);
      previews.current.delete(previous.previewUrl);
    }
    setSides((current) => ({ ...current, [side]: value }));
  }

  function chooseType(value: string) {
    setIdType(value as IdType);
    setSubmitError(null);
    // A single-page document has no back; drop one taken for a card.
    if (!idTypeOption(value as IdType)?.hasBack) setSide('back', EMPTY);
  }

  async function upload(side: Side, file: File) {
    setSide(side, { state: 'uploading' });
    setSubmitError(null);
    try {
      const blob = await resizeImage(file, ID_EDGE);
      const contentType = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
      const ticket = await requestIdUploadUrl(side, contentType);
      try {
        await uploadImage(blob, ticket.uploadUrl);
      } catch {
        throw new Error(message('idStep.uploadFailed').text);
      }
      const previewUrl = URL.createObjectURL(blob);
      previews.current.add(previewUrl);
      setSide(side, { state: 'done', key: ticket.objectKey, previewUrl });
    } catch (error) {
      const text =
        error instanceof ApiError && error.code === 'ID_STORAGE_UNAVAILABLE'
          ? message('idStep.storageUnavailable').text
          : error instanceof Error
            ? error.message
            : message('idStep.uploadFailed').text;
      setSide(side, { state: 'error', message: text });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !option || sides.front.state !== 'done') return;
    setSubmitError(null);
    try {
      await submit.mutateAsync({
        idType: option.id,
        frontKey: sides.front.key,
        ...(needsBack && sides.back.state === 'done' ? { backKey: sides.back.key } : {}),
        idConsent: true,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : message('idStep.uploadFailed').text);
    }
  }

  const groups: { id: IdTypeGroup; label: ResolvedMessage }[] = [
    { id: 'government', label: message('idStep.accepted.government') },
    { id: 'local', label: message('idStep.accepted.local') },
    { id: 'school', label: message('idStep.accepted.school') },
  ];

  return (
    <div className="min-h-page bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
        </Container>
      </header>

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <Eyebrow>
            <Text message={message('idStep.eyebrow')} />
          </Eyebrow>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
            <Text message={message(declined ? 'idStep.resubmit.heading' : 'idStep.heading')} />
          </h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            <Text message={message(declined ? 'idStep.resubmit.intro' : 'idStep.intro')} />
          </p>

          {declined && user?.idVerification?.reason && (
            <p
              role="alert"
              className="mt-6 rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            >
              <Text message={message('verification.reasonLabel')} /> {user.idVerification.reason}
            </p>
          )}

          <section className="mt-10" aria-labelledby="id-accepted">
            <h2 id="id-accepted" className="text-lg font-bold text-ink">
              <Text message={message('idStep.accepted.heading')} />
            </h2>
            <div className="mt-4 grid gap-5">
              {groups.map((group) => (
                <div key={group.id}>
                  <h3 className="text-sm font-semibold text-ink">
                    <Text message={group.label} />
                  </h3>
                  <ul className="mt-2 grid gap-1 text-sm text-ink-muted">
                    {ID_TYPE_OPTIONS.filter((item) => item.group === group.id).map((item) => (
                      <li key={item.id}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-sm text-ink-muted">
                <Text message={message('idStep.accepted.notAccepted')} />
              </p>
            </div>
          </section>

          <form onSubmit={(event) => void onSubmit(event)} className="mt-10 grid gap-8" noValidate>
            <section
              aria-labelledby="id-consent"
              className="rounded-md border border-hairline bg-surface p-5"
            >
              <h2 id="id-consent" className="flex items-center gap-2 text-lg font-bold text-ink">
                <ShieldCheck className="size-5 text-navy-700" aria-hidden="true" />
                <Text message={message('idStep.consent.heading')} />
              </h2>
              <p className="mt-3 text-md text-ink">
                <Text message={message('idStep.consent.text')} />
              </p>
              <label className="mt-4 flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 size-4 rounded-xs accent-primary"
                />
                <Text message={message('idStep.consent.agree')} />
              </label>
            </section>

            <section aria-labelledby="id-guidance">
              <h2 id="id-guidance" className="text-lg font-bold text-ink">
                <Text message={message('idStep.guidance.heading')} />
              </h2>
              <ul className="mt-3 grid gap-1 text-sm text-ink-muted">
                {(['idStep.guidance.corners', 'idStep.guidance.glare', 'idStep.guidance.readable'] as const).map(
                  (key) => (
                    <li key={key} className="flex items-start gap-2">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-navy-700" aria-hidden="true" />
                      <Text message={message(key)} />
                    </li>
                  ),
                )}
              </ul>
            </section>

            <Select
              label={message('idStep.type.label').text}
              placeholder={message('idStep.type.placeholder').text}
              value={idType}
              onValueChange={chooseType}
              groups={groups.map((group) => ({
                label: group.label.text,
                options: ID_TYPE_OPTIONS.filter((item) => item.group === group.id).map((item) => ({
                  value: item.id,
                  label: item.label,
                })),
              }))}
            />

            {!consent && (
              <p className="-mb-4 text-sm text-ink-muted">
                <Text message={message('idStep.consent.first')} />
              </p>
            )}

            <PhotoSide
              side="front"
              label={message('idStep.side.front')}
              state={sides.front}
              disabled={!consent}
              onFile={(file) => void upload('front', file)}
            />
            {option && !needsBack && (
              <p className="-mt-4 text-sm text-ink-muted">
                <Text message={message('idStep.side.frontOnly')} />
              </p>
            )}
            {needsBack && (
              <PhotoSide
                side="back"
                label={message('idStep.side.back')}
                state={sides.back}
                disabled={!consent}
                onFile={(file) => void upload('back', file)}
              />
            )}

            {submitError && (
              <p
                role="alert"
                className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
              >
                {submitError}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={!ready} loading={submit.isPending}>
              <Text message={message('idStep.submit')} />
            </Button>
          </form>
        </Container>
      </main>
    </div>
  );
}

function Text({ message }: { message: ResolvedMessage }) {
  return <span lang={message.lang}>{message.text}</span>;
}

/**
 * One side of the ID. Two ways in, because one input cannot do both on a phone:
 * `capture` opens the camera directly, and on Android it also hides the
 * gallery, so choosing an existing photo needs an input without it.
 */
function PhotoSide({
  side,
  label,
  state,
  disabled,
  onFile,
}: {
  side: Side;
  label: ResolvedMessage;
  state: SideState;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const { message } = useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const busy = state.state === 'uploading';

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  }

  return (
    <section aria-labelledby={`id-side-${side}`} className="grid gap-3">
      <h2 id={`id-side-${side}`} className="text-base font-semibold text-ink">
        <Text message={label} />
      </h2>

      {state.state === 'done' && (
        <figure className="grid gap-2">
          <img
            src={state.previewUrl}
            alt=""
            className="max-h-56 w-full rounded-md border border-hairline bg-slate-50 object-contain"
          />
          <figcaption className="flex items-center gap-1.5 text-sm text-success-700">
            <CircleCheck className="size-4" aria-hidden="true" />
            <Text message={message('idStep.uploaded')} />
          </figcaption>
        </figure>
      )}

      {state.state === 'error' && (
        <p role="alert" className="text-sm text-danger-700">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onChange}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onChange}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          loading={busy}
          iconLeft={<Camera className="size-4" aria-hidden="true" />}
          onClick={() => cameraRef.current?.click()}
        >
          <Text message={message(busy ? 'idStep.uploading' : 'idStep.takePhoto')} />
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          iconLeft={<ImageUp className="size-4" aria-hidden="true" />}
          onClick={() => galleryRef.current?.click()}
        >
          <Text message={message('idStep.choosePhoto')} />
        </Button>
      </div>
    </section>
  );
}
