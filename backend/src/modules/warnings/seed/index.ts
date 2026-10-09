import { normalizePhone } from '@shared/contracts/identity';
import type { SeedContext, SeedFunction } from '@shared/module';
import { TargetArea } from '../domain/TargetArea';
import { Warning } from '../domain/Warning';
import { MongoWarningRepository } from '../infrastructure/MongoWarningRepository';
import { WarningModel } from '../infrastructure/models';
import { DEMO_VALIDITY_DAYS, DEMO_WARNINGS, demoCitizens, type DemoWarning } from './demoData';

const DAY_MS = 24 * 3_600_000;
const MINUTE_MS = 60_000;

/** Citizens are created exactly like real registrations, and skipped when their phone already exists. */
async function seedCitizens(ctx: SeedContext): Promise<number> {
  let created = 0;
  for (const citizen of demoCitizens()) {
    const phone = normalizePhone(citizen.phone) as string;
    if (await ctx.users.findByPhone(phone)) continue;
    await ctx.accounts.createCitizen({
      ...citizen,
      phone,
      role: 'CITIZEN',
      passwordHash: ctx.demoPasswordHash,
    });
    created += 1;
  }
  return created;
}

/** A warning seeded before the list showed names gets its name now; nothing else about it is touched. */
const addMissingName = (demo: DemoWarning) =>
  WarningModel.updateOne(
    { _id: demo.warningId, submittedByName: { $exists: false } },
    { $set: { submittedByName: demo.submittedByName } },
  );

/** Newest first in the list, as in the wireframe: each one was submitted a few minutes before the last. */
async function seedPendingWarnings(ctx: SeedContext): Promise<number> {
  const warnings = new MongoWarningRepository();
  const now = ctx.clock.now();
  let created = 0;
  for (const [position, demo] of DEMO_WARNINGS.entries()) {
    if (await warnings.findById(demo.warningId)) {
      await addMissingName(demo);
      continue;
    }
    const submittedAt = new Date(now.getTime() - position * 7 * MINUTE_MS);
    await warnings.insert(
      Warning.create(
        {
          warningId: demo.warningId,
          hazardType: demo.hazardType,
          severity: demo.severity,
          messages: demo.messages,
          targetAreas: [new TargetArea(demo.area)],
          validFrom: submittedAt,
          validTo: new Date(submittedAt.getTime() + DEMO_VALIDITY_DAYS * DAY_MS),
          submittedBy: demo.submittedBy,
          submittedByName: demo.submittedByName,
        },
        submittedAt,
      ),
    );
    created += 1;
  }
  return created;
}

/**
 * UC-1 demo data: the five pending warnings of the wireframe (Gampaha, Ratnapura, Kalutara, Colombo,
 * Kegalle) and 200 citizens with a mix of device tokens, phones and opt-ins. Safe to run again.
 */
export const seedWarnings: SeedFunction = async (ctx) => {
  const citizens = await seedCitizens(ctx);
  const warnings = await seedPendingWarnings(ctx);
  ctx.logger.info('Seeded UC-1 demo data', { newCitizens: citizens, newWarnings: warnings });
};
