import mongoose from 'mongoose';
import { seedExtraAccounts } from './accounts';
import { seedAnalyticsHistory } from './analytics';
import { seedHazardHistory } from './hazardReports';
import { seedResourceHistory } from './resources';
import { countDatabase, type DatabaseCounts, type DemoSeedSummary } from './summary';
import { seedWarningHistory } from './warnings';
import { buildWorld, type DemoSeedContext } from './world';

/** Bump this when the scenarios change shape, so an older database is recognised as out of date. */
export const DEMO_SEED_VERSION = 1;

const MARKER_ID = 'demo-scenarios';
/** The first thing the scenarios write (the first report of the first story), so a half-finished earlier run is noticed. */
const FIRST_SCENARIO_REPORT = 'demo-ratnapura-landslide-1';

interface Marker {
  _id: string;
  version: number;
  seededAt: Date;
  database: DatabaseCounts;
}

const markers = () => mongoose.connection.collection<Marker>('demo_seed_state');

/**
 * Adds the use-case scenarios on top of the base seed (accounts, 200 citizens, the five pending warnings,
 * the five report clusters, resource needs and six months of analytics). It is meant for an empty
 * database: the scenarios move stock and counters, so they are never run twice. A marker records that they
 * ran; `--fresh` (which drops the database) is how they are rebuilt.
 */
export async function runDemoScenarios(ctx: DemoSeedContext): Promise<DemoSeedSummary> {
  if (await markers().findOne({ _id: MARKER_ID })) return { alreadySeeded: true };
  if (
    await mongoose.connection
      .collection('hazard_reports')
      .findOne({ clientReportId: FIRST_SCENARIO_REPORT })
  ) {
    throw new Error(
      'A previous run of the demo seed stopped half-way, and its data is still here. ' +
        'Run `npm run seed:demo -- --fresh` to rebuild the database from scratch.',
    );
  }

  const log = (phase: string, data?: Record<string, unknown>) => ctx.logger.info(phase, data);
  const accounts = await seedExtraAccounts(ctx);
  log('Added the extra demo accounts', { ...accounts });

  const world = await buildWorld(ctx);
  const { stories, ...hazards } = await seedHazardHistory(world);
  log('UC-3: reports, reviews and one escalation done', { ...hazards });
  const warnings = await seedWarningHistory(world, { stories, ...hazards });
  log('UC-1: warnings issued, rejected and delivered', { issued: warnings.issued.length });
  const resources = await seedResourceHistory(world);
  log('UC-2: requests, answers, arrivals and shelter reports done', { ...resources });
  const analytics = await seedAnalyticsHistory(world);
  log('UC-4: exports done', { ...analytics });

  world.travelTo(0);
  const database = await countDatabase(world);
  await markers().insertOne({
    _id: MARKER_ID,
    version: DEMO_SEED_VERSION,
    seededAt: world.startedAt,
    database,
  });
  return { alreadySeeded: false, accounts, hazards, warnings, resources, analytics, database };
}
