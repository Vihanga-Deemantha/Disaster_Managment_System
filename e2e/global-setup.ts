import { execSync } from 'node:child_process';
import { E2E_MONGODB_URI } from '../playwright.config';

/** Every run starts from the same freshly seeded database (staff, demo citizens, river basins). */
export default function globalSetup(): void {
  execSync('npm run seed -w backend -- --fresh', {
    stdio: 'inherit',
    env: { ...process.env, MONGODB_URI: E2E_MONGODB_URI, LOG_LEVEL: 'warn' },
  });
}
