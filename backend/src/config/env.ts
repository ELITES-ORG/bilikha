import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at boot. A missing or malformed variable
 * should crash the process immediately rather than surface as a confusing
 * runtime error three layers deep in a request handler.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    // Every secret here is pasted into a dashboard by hand, and a textarea makes
    // a trailing newline invisible. An untrimmed value fails far from its cause:
    // a stray newline in a JWT is a rejected token, in SESSION_SECRET it is a
    // different secret. Trim everything that arrives as free text.
    DATABASE_URL: z
      .string()
      .trim()
      .url({ message: 'DATABASE_URL must be a valid postgres:// connection string' }),

    // Comma-separated list of origins allowed to call the API with credentials.
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    SESSION_SECRET: z.string().trim().min(32, 'SESSION_SECRET must be at least 32 characters'),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

    // Optional on purpose. If these are required, a deploy that forgets one
    // exits at boot and takes the whole API down — auth, directory, messages —
    // for a subsystem that only serves images. Missing config instead disables
    // image storage and leaves everything else working. See isStorageConfigured.
    SUPABASE_URL: z
      .string()
      .trim()
      .url('SUPABASE_URL must be the project URL, e.g. https://abc.supabase.co')
      .optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(20).optional(),
    SUPABASE_STORAGE_BUCKET: z.string().trim().default('media'),
    // The private bucket for ID photos (ADR 0057). Never the media bucket, which
    // is public: refused below if the two are the same in any letter case. A
    // plain name only — a slash or space would build a different path than the
    // one the readiness check asks about.
    SUPABASE_ID_BUCKET: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9][a-z0-9._-]{0,62}$/,
        'SUPABASE_ID_BUCKET must be a bucket name: lowercase letters, digits, dots, hyphens and underscores',
      )
      .default('ids'),

    // Kinds besides images that accept uploads (ADR 0046). Empty or unset: images
    // only. Set on staging first, and on production only once Supabase Pro is
    // active there. Turning a kind off stops new uploads; published items stay.
    MEDIA_UPLOAD_KINDS: z.preprocess(
      (value) => (typeof value === 'string' ? value : ''),
      z
        .string()
        .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
        .pipe(z.array(z.enum(['audio', 'video', 'document']))),
    ),

    // Files in messages (ADR 0060). Off unless "true": set on staging once the
    // four private message buckets exist, and on production once Supabase Pro
    // is active there. Turning it off stops new files; sent ones stay readable.
    MESSAGE_ATTACHMENTS: z.preprocess((value) => value === 'true', z.boolean()),

    // Keys the hash that recognises a repeated ID number (plan 0053 Step 1.7).
    // Optional at boot like storage, so a deploy without it keeps everything
    // else working; deciding an ID then answers 503. **Never rotate it**: a new
    // secret makes every stored hash unmatchable. Blank means unset.
    ID_HASH_SECRET: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z
        .string()
        .trim()
        .min(32, 'ID_HASH_SECRET must be at least 32 characters')
        // The example file's placeholder is long enough to pass the length
        // check, and it is public. Hashes keyed with it could be reversed by
        // anyone, and the secret can never be rotated.
        .refine((value) => !/replace-me/i.test(value), {
          message: 'ID_HASH_SECRET is still the example placeholder. Generate one: openssl rand -hex 32',
        })
        .optional(),
    ),

    // Optional for the same reason as storage: without it nothing is reported and
    // everything else works. `.env.example` leaves it empty, so empty means unset.
    // See lib/error-reporting.ts and ADR 0053.
    SENTRY_DSN: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().url('SENTRY_DSN must be the DSN URL from the Sentry project').optional(),
    ),

    // Set by Render on every service, never by hand. They name the deployment the
    // way the hostname does for the frontend: the branch cannot be misconfigured,
    // a hand-typed SENTRY_ENVIRONMENT could. Absent everywhere but Render.
    RENDER_GIT_BRANCH: z.string().trim().optional(),
    RENDER_GIT_COMMIT: z.string().trim().optional(),
  })
  .refine((value) => value.SUPABASE_ID_BUCKET.toLowerCase() !== value.SUPABASE_STORAGE_BUCKET.toLowerCase(), {
    path: ['SUPABASE_ID_BUCKET'],
    message: 'SUPABASE_ID_BUCKET must not be the public media bucket',
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
