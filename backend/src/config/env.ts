import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at boot. A missing or malformed variable
 * should crash the process immediately rather than surface as a confusing
 * runtime error three layers deep in a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid postgres:// connection string' }),

  // Comma-separated list of origins allowed to call the API with credentials.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Optional on purpose. If these are required, a deploy that forgets one
  // exits at boot and takes the whole API down — auth, directory, messages —
  // for a subsystem that only serves images. Missing config instead disables
  // image storage and leaves everything else working. See isStorageConfigured.
  SUPABASE_URL: z
    .string()
    .url('SUPABASE_URL must be the project URL, e.g. https://abc.supabase.co')
    .optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('media'),
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
