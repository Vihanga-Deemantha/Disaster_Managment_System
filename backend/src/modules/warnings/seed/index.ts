import type { SeedFunction } from '@shared/module';

/**
 * UC-1 demo data: 5 pending warnings matching the wireframe rows (Gampaha, Ratnapura, Kalutara,
 * Colombo, Kegalle) and about 200 citizens with a mix of device tokens, phones and opt-ins. Create
 * citizens with `ctx.accounts.createCitizen(...)` and `ctx.demoPasswordHash`; the two demo river
 * basins already exist (see shared/auth/seed).
 */
export const seedWarnings: SeedFunction = async () => undefined;
