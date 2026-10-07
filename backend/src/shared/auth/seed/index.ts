import { normalizePhone } from '../../contracts/identity';
import { RiverBasinModel } from '../../geo/RiverBasin';
import type { SeedContext } from '../../module';
import { DEMO_CITIZENS, DEMO_RIVER_BASINS, DEMO_STAFF } from './demoAccounts';

export * from './demoAccounts';

/** Idempotent: re-running the seed neither duplicates accounts nor resets changed passwords. */
export async function seedAuth(ctx: SeedContext): Promise<void> {
  for (const basin of DEMO_RIVER_BASINS) {
    await RiverBasinModel.replaceOne({ _id: basin._id }, basin, { upsert: true });
  }
  for (const staff of DEMO_STAFF) {
    if (await ctx.users.findByEmail(staff.email)) continue;
    await ctx.accounts.createStaff({
      userId: staff.userId,
      role: staff.role,
      displayName: staff.displayName,
      email: staff.email,
      passwordHash: ctx.demoPasswordHash,
      district: staff.district,
      organizationId: staff.organization?.id,
      organizationType: staff.organization?.type,
    });
  }
  for (const citizen of DEMO_CITIZENS) {
    const phone = normalizePhone(citizen.phone) as string;
    if (await ctx.users.findByPhone(phone)) continue;
    await ctx.accounts.createCitizen({
      ...citizen,
      phone,
      passwordHash: ctx.demoPasswordHash,
      whatsappOptIn: citizen.whatsappOptIn ?? false,
      emailOptIn: citizen.emailOptIn ?? false,
    });
  }
  ctx.logger.info('Seeded demo staff, citizens and river basins', {
    staff: DEMO_STAFF.length,
    citizens: DEMO_CITIZENS.length,
    basins: DEMO_RIVER_BASINS.length,
  });
}
