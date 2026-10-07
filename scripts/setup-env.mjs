// Creates backend/.env from backend/.env.example with freshly generated secrets.
// Safe to re-run: it never overwrites an existing .env unless you pass --force.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const example = `${root}backend/.env.example`;
const target = `${root}backend/.env`;

if (existsSync(target) && !process.argv.includes('--force')) {
  process.stdout.write(
    'backend/.env already exists; leaving it alone (use --force to regenerate).\n',
  );
  process.exit(0);
}

const values = {
  __JWT_ACCESS_SECRET__: randomBytes(48).toString('base64url'),
  __NIC_ENCRYPTION_KEY__: randomBytes(32).toString('base64'),
  __NIC_HASH_KEY__: randomBytes(32).toString('base64'),
};

let content = readFileSync(example, 'utf8');
for (const [marker, secret] of Object.entries(values)) content = content.replace(marker, secret);
writeFileSync(target, content, { mode: 0o600 });

process.stdout.write(
  'Created backend/.env with new secrets.\n' +
    'Next: make sure MongoDB is running (see README), then `npm run seed` and `npm run dev`.\n',
);
