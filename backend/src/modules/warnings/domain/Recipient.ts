import type { District, Language } from '@shared/contracts/enums';
import type { GeoPoint } from '@shared/geo/GeoPoint';

/**
 * A registered citizen as UC-1 sees them (the "Citizen (read model)" of the plan). There is no NIC
 * here on purpose: alert targeting needs location, language and contact points, never an identity number.
 */
export interface Recipient {
  citizenId: string;
  fullName: string;
  district: District;
  riverBasinId?: string;
  homeLocation: GeoPoint;
  addressLine?: string;
  preferredLanguage: Language;
  phone?: string;
  deviceToken?: string;
  email?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
}
