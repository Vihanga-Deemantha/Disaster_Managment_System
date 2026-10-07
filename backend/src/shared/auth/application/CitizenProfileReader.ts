import type { District, Language } from '../../contracts/enums';
import type { GeoPoint } from '../../geo/GeoPoint';

/**
 * A registered citizen as other modules may see them. There is deliberately no NIC field: UC-1
 * targets alerts by location and language and never needs to read an identity number.
 */
export interface CitizenProfileView {
  citizenId: string;
  fullName: string;
  phone: string;
  homeLocation: GeoPoint;
  addressLine?: string;
  district: District;
  riverBasinId?: string;
  preferredLanguage: Language;
  deviceToken?: string;
  email?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
}

/**
 * The port UC-1's `CitizenDirectory` adapter reads through (master plan §7.1.2): citizen
 * self-registration fills it, alert targeting reads it.
 */
export interface CitizenProfileReader {
  findById(citizenId: string): Promise<CitizenProfileView | null>;
  findByDistrict(district: District): Promise<CitizenProfileView[]>;
  findByRiverBasin(riverBasinId: string): Promise<CitizenProfileView[]>;
  /** Citizens whose home location lies inside the polygon's outer ring (MongoDB `$geoWithin` rules). */
  findWithinPolygon(ring: readonly GeoPoint[]): Promise<CitizenProfileView[]>;
}
