import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildApplication } from '../../../bootstrap';
import { loadConfig } from '@shared/config/env';
import { nullLogger } from '@shared/logging/Logger';
import { DEMO_STAFF, DEFAULT_DEMO_PASSWORD } from '@shared/auth/seed';
import { seedAnalyticsStore } from '../seed';
import { MongoAnalyticsStore } from '../infrastructure/AnalyticsStore';

/** Isolated browser verification. Never connects to or resets a user's existing database. */
async function main() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    NIC_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    NIC_HASH_KEY: randomBytes(32).toString('base64'),
    CORS_ORIGINS: 'http://localhost:4184',
    PORT: '4124',
  });
  const { app, auth, ctx } = await buildApplication(config, nullLogger);
  const passwordHash = await auth.hasher.hash(DEFAULT_DEMO_PASSWORD);
  for (const staff of DEMO_STAFF.filter((staff) =>
    ['DMC_OFFICER', 'NGO_MANAGER', 'DONOR'].includes(staff.role),
  )) {
    await auth.accounts.createStaff({
      userId: staff.userId,
      role: staff.role,
      displayName: staff.displayName,
      email: staff.email,
      passwordHash,
      organizationId: staff.organization?.id,
      organizationType: staff.organization?.type,
    });
  }
  await seedAnalyticsStore(new MongoAnalyticsStore(), ctx.clock.now());
  const server = app.listen(4124, '127.0.0.1', () =>
    process.stdout.write('UC-4 isolated API ready on 4124\n'),
  );
  const stop = () => {
    server.close(() => {
      void mongoose
        .disconnect()
        .then(() => mongo.stop())
        .then(() => process.exit(0));
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
void main().catch((error: unknown) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
