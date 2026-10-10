import { loadConfig, loadEnvFileIfPresent } from '@shared/config/env';
import { connectMongo, disconnectMongo } from '@shared/db/connection';
import '@shared/audit/AuditLog';
import { SystemClock } from '@shared/time/Clock';
import { MongoResourceUnitOfWork } from '../infrastructure/MongoResourceStore';
import { seedScenarios } from './scenarios';

async function main() {
  loadEnvFileIfPresent();
  const config = loadConfig();
  if (config.isProduction || !new URL(config.mongoUri).pathname.startsWith('/safezone'))
    throw new Error('Demo scenarios require a development safezone database.');
  await connectMongo(config.mongoUri);
  try {
    await seedScenarios(new MongoResourceUnitOfWork(), new SystemClock().now());
    process.stdout.write(
      'UC-2 demo scenarios ready in Gampaha, Colombo and Ratnapura. Existing data preserved.\n',
    );
  } finally {
    await disconnectMongo();
  }
}
main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
