import { loadConfig, loadEnvFileIfPresent } from '@shared/config/env';
import { connectMongo, disconnectMongo } from '@shared/db/connection';
import { MongoAnalyticsStore } from '../infrastructure/AnalyticsStore';
import { seedAnalyticsStore } from './index';

/** Populate analytics only; stable IDs preserve existing records and report history. */
async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const config = loadConfig();
  if (config.isProduction) throw new Error('Refusing to seed demo analytics in production.');
  await connectMongo(config.mongoUri);
  try {
    await seedAnalyticsStore(new MongoAnalyticsStore(), new Date());
    process.stdout.write('Analytics seeded across 10 districts and six months.\n');
  } finally {
    await disconnectMongo();
  }
}
main().catch((error: unknown) => {
  process.stderr.write(
    `Analytics seed failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
