#!/usr/bin/env node
/**
 * Creates each service's .env from its .env.example when one does not already
 * exist. Never overwrites — a developer's local configuration is theirs.
 *
 * Exists so `npm run setup` leaves a working tree rather than a tree that fails
 * at boot with a confusing environment-validation error.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const services = ['backend', 'frontend'];

let created = 0;

for (const service of services) {
  const example = join(root, service, '.env.example');
  const target = join(root, service, '.env');

  if (!existsSync(example)) {
    console.warn(`  skip    ${service}/.env.example not found`);
    continue;
  }

  if (existsSync(target)) {
    console.log(`  keep    ${service}/.env already exists`);
    continue;
  }

  copyFileSync(example, target);
  console.log(`  create  ${service}/.env`);
  created += 1;
}

console.log(created > 0 ? `\nCreated ${created} env file(s).` : '\nNothing to do.');
