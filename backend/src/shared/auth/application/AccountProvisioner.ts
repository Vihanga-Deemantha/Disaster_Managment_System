import type { District, Language, OrganizationType, Role } from '../../contracts/enums';
import { toCanonicalNic } from '../../contracts/identity';
import type { GeoPoint } from '../../geo/GeoPoint';
import type { RiverBasinLocator } from '../../geo/RiverBasin';
import type { Clock } from '../../time/Clock';
import type { CitizenProfile, User } from '../domain/types';
import type { CitizenProfileRepository, NicProtector, UserRepository } from './ports';

export interface StaffSpec {
  userId: string;
  role: Role;
  displayName: string;
  email: string;
  passwordHash: string;
  district?: District;
  organizationId?: string;
  organizationType?: OrganizationType;
}

export interface CitizenSpec {
  userId: string;
  role: Extract<Role, 'CITIZEN' | 'COMMUNITY_VOLUNTEER'>;
  /** The NIC as typed (old or new format, already validated). */
  nic: string;
  fullName: string;
  /** Normalised `+947XXXXXXXX`. */
  phone: string;
  passwordHash: string;
  homeLocation: GeoPoint;
  addressLine?: string;
  district: District;
  preferredLanguage: Language;
  deviceToken?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  email?: string;
}

/**
 * Builds the stored records for an account. Shared by self-registration and by the seed script, so a
 * demo citizen is stored exactly like a real one (encrypted NIC, derived river basin).
 */
export class AccountProvisioner {
  constructor(
    private readonly users: UserRepository,
    private readonly profiles: CitizenProfileRepository,
    private readonly nic: NicProtector,
    private readonly basins: RiverBasinLocator,
    private readonly clock: Clock,
  ) {}

  async createStaff(spec: StaffSpec): Promise<User> {
    const user: User = {
      userId: spec.userId,
      role: spec.role,
      displayName: spec.displayName,
      email: spec.email,
      passwordHash: spec.passwordHash,
      status: 'ACTIVE',
      district: spec.district,
      organizationId: spec.organizationId,
      organizationType: spec.organizationType,
      createdAt: this.clock.now(),
    };
    await this.users.create(user);
    return user;
  }

  /**
   * Creates the user and the profile. Standalone MongoDB has no transactions, so if the profile
   * cannot be saved (e.g. a concurrent registration took the same NIC) the user is removed again.
   */
  async createCitizen(spec: CitizenSpec): Promise<{ user: User; profile: CitizenProfile }> {
    const user: User = {
      userId: spec.userId,
      role: spec.role,
      displayName: spec.fullName,
      phone: spec.phone,
      passwordHash: spec.passwordHash,
      status: 'ACTIVE',
      district: spec.district,
      createdAt: this.clock.now(),
    };
    const profile: CitizenProfile = {
      userId: spec.userId,
      nicEncrypted: this.nic.encrypt(spec.nic),
      nicHash: this.nic.hash(toCanonicalNic(spec.nic)),
      fullName: spec.fullName,
      phone: spec.phone,
      homeLocation: spec.homeLocation,
      addressLine: spec.addressLine,
      district: spec.district,
      riverBasinId: await this.basins.locate(spec.homeLocation),
      preferredLanguage: spec.preferredLanguage,
      deviceToken: spec.deviceToken,
      whatsappOptIn: spec.whatsappOptIn,
      emailOptIn: spec.emailOptIn,
      email: spec.email,
    };
    await this.users.create(user);
    try {
      await this.profiles.create(profile);
    } catch (error) {
      await this.users.delete(user.userId);
      throw error;
    }
    return { user, profile };
  }
}
