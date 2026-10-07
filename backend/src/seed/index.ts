import mongoose from 'mongoose';
import { seedAnalytics } from '../modules/analytics/seed';
import { seedHazardReports } from '../modules/hazard-reports/seed';
import { seedResources } from '../modules/resources/seed';
import { seedWarnings } from '../modules/warnings/seed';
import { MongoAuditLog } from '../shared/audit/AuditLog';
import { composeAuth } from '../shared/auth/composition';
import { DEFAULT_DEMO_PASSWORD, seedAuth } from '../shared/auth/seed';
import { loadConfig, loadEnvFileIfPresent } from '../shared/config/env';
import { checkPassword } from '../shared/contracts/identity';
import { connectMongo, disconnectMongo } from '../shared/db/connection';
import { UuidGenerator } from '../shared/ids/IdGenerator';
import { createLogger } from '../shared/logging/Logger';
import type { SeedContext, SeedFunction } from '../shared/module';
import { SystemClock } from '../shared/time/Clock';

/** Auth runs first (staff, citizens, river basins); then each use case adds its own demo data. */
const MODULE_SEEDS: readonly SeedFunction[] = [
  seedWarnings,
  seedResources,
  seedHazardReports,
  seedAnalytics,
];

/** `--fresh` wipes the database first, but only one that is clearly ours and clearly not production. */
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
  if (process.argv.includes('--fresh')) await dropOwnDatabase();

  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const auth = await composeAuth({ config, clock, ids, audit: new MongoAuditLog(), logger });
  const ctx: SeedContext = {
    logger,
    clock,
    ids,
    accounts: auth.accounts,
    users: auth.users,
    demoPasswordHash: await auth.hasher.hash(password),
  };

  await seedAuth(ctx);
  for (const seed of MODULE_SEEDS) await seed(ctx);
  await disconnectMongo();
  logger.info('Seeding complete. Demo logins are listed in the README.');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `\nSeeding failed: ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});
