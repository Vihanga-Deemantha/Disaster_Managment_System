import mongoose from 'mongoose';
import { MongoAuditLog } from '@shared/audit/AuditLog';
import { composeAuth } from '@shared/auth/composition';
import { DEFAULT_DEMO_PASSWORD, seedAuth } from '@shared/auth/seed';
import { loadConfig, loadEnvFileIfPresent } from '@shared/config/env';
import { checkPassword } from '@shared/contracts/identity';
import { connectMongo, disconnectMongo } from '@shared/db/connection';
import { UuidGenerator } from '@shared/ids/IdGenerator';
import { createLogger } from '@shared/logging/Logger';
import { SystemClock } from '@shared/time/Clock';
import { MongoAnalyticsStore } from '../../modules/analytics/infrastructure/AnalyticsStore';
import { seedAnalyticsStore } from '../../modules/analytics/seed';
import { seedHazardReports } from '../../modules/hazard-reports/seed';
import { seedResources } from '../../modules/resources/seed';
import { seedWarnings } from '../../modules/warnings/seed';
import { ParallelAnalyticsStore } from './analytics';
import { runDemoScenarios } from './run';
import { describeSummary } from './summary';
import type { DemoSeedContext } from './world';

/**
 * `npm run seed:demo`: the base seed (accounts, citizens, pending warnings, report clusters, resource needs,
 * six months of analytics) and then the scenarios that give every use case every state: issued and rejected
 * warnings with delivery history, verified and escalated reports, requests of every outcome, saved exports.
 * `--fresh` first drops the database, which only a name starting with `safezone` allows.
 */
async function dropOwnDatabase(): Promise<void> {
  const name = mongoose.connection.name;
  if (!name.startsWith('safezone')) {
    throw new Error(`Refusing to drop "${name}": only databases named safezone* may be reset.`);
  }
  await mongoose.connection.dropDatabase();
}

async function main(): Promise<void> {
  loadEnvFileIfPresent();
  const config = loadConfig();
  if (config.isProduction) throw new Error('Refusing to seed demo accounts in production.');
  const logger = createLogger({ level: config.logLevel, pretty: true });

  const password = process.env.SEED_PASSWORD ?? DEFAULT_DEMO_PASSWORD;
  const rejection = checkPassword(password);
  if (rejection) throw new Error(`SEED_PASSWORD does not meet the password policy (${rejection}).`);

  await connectMongo(config.mongoUri);
  logger.info('Connected', { database: mongoose.connection.name });
  if (process.argv.includes('--fresh')) {
    await dropOwnDatabase();
    logger.info('Dropped the database (--fresh)');
  }

  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const auth = await composeAuth({ config, clock, ids, audit: new MongoAuditLog(), logger });
  const ctx: DemoSeedContext = {
    logger,
    clock,
    ids,
    accounts: auth.accounts,
    users: auth.users,
    demoPasswordHash: await auth.hasher.hash(password),
    citizenProfiles: auth.citizenProfiles,
  };

  // The base seed, in the order `npm run seed` runs it; analytics goes through a store that writes in parallel.
  await seedAuth(ctx);
  await seedWarnings(ctx);
  await seedResources(ctx);
  await seedHazardReports(ctx);
  const analytics = new ParallelAnalyticsStore(new MongoAnalyticsStore());
  await seedAnalyticsStore(analytics, clock.now());
  await analytics.drain();
  logger.info('Base demo data is in place');

  const summary = await runDemoScenarios(ctx);
  await disconnectMongo();
  for (const line of describeSummary(summary)) process.stdout.write(`${line}\n`);
}

main().catch((error: unknown) => {
  const detail =
    error instanceof Error
      ? process.env.LOG_LEVEL === 'debug'
        ? (error.stack ?? error.message)
        : error.message
      : String(error);
  process.stderr.write(`
Demo seeding failed: ${detail}

`);
  process.exit(1);
});
