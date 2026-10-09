import type { District } from '../../contracts/enums';
import type { GeoPoint } from '../../geo/GeoPoint';
import type { CitizenProfileReader, CitizenProfileView } from '../application/CitizenProfileReader';
import type { CitizenProfileRepository } from '../application/ports';
import type { CitizenProfile } from '../domain/types';
import { asDuplicateError } from './MongoUserRepository';
import { CitizenProfileModel, type CitizenProfileDoc } from './models';

const toPoint = (location: GeoPoint): CitizenProfileDoc['homeLocation'] => ({
  type: 'Point',
  coordinates: [location.lng, location.lat],
});

const fromPoint = (point: CitizenProfileDoc['homeLocation']): GeoPoint => ({
  lat: point.coordinates[1],
  lng: point.coordinates[0],
});

function toProfile(doc: CitizenProfileDoc): CitizenProfile {
  return {
    userId: doc._id,
    nicEncrypted: doc.nicEncrypted,
    nicHash: doc.nicHash,
    fullName: doc.fullName,
    phone: doc.phone,
    homeLocation: fromPoint(doc.homeLocation),
    addressLine: doc.addressLine,
    district: doc.district,
    riverBasinId: doc.riverBasinId,
    preferredLanguage: doc.preferredLanguage,
    deviceToken: doc.deviceToken,
    whatsappOptIn: doc.whatsappOptIn,
    emailOptIn: doc.emailOptIn,
    email: doc.email,
  };
}

/** The public projection: everything targeting needs, and never the NIC fields. */
function toView(doc: CitizenProfileDoc): CitizenProfileView {
  return {
    citizenId: doc._id,
    fullName: doc.fullName,
    phone: doc.phone,
    homeLocation: fromPoint(doc.homeLocation),
    addressLine: doc.addressLine,
    district: doc.district,
    riverBasinId: doc.riverBasinId,
    preferredLanguage: doc.preferredLanguage,
    deviceToken: doc.deviceToken,
    email: doc.email,
    whatsappOptIn: doc.whatsappOptIn,
    emailOptIn: doc.emailOptIn,
  };
}

/** GeoJSON requires a closed ring: the first and last positions must match. */
function closedRing(ring: readonly GeoPoint[]): number[][] {
  const positions = ring.map((point) => [point.lng, point.lat]);
  const first = positions[0] as number[];
  const last = positions[positions.length - 1] as number[];
  return first[0] === last[0] && first[1] === last[1] ? positions : [...positions, first];
}

const NO_NIC = '-nicEncrypted -nicHash';

/**
 * Persists citizen profiles for registration and serves them to other modules through the
 * `CitizenProfileReader` port (UC-1 alert targeting).
 */
export class MongoCitizenProfileRepository
  implements CitizenProfileRepository, CitizenProfileReader
{
  async create(profile: CitizenProfile): Promise<void> {
    const { userId, homeLocation, ...rest } = profile;
    try {
      await CitizenProfileModel.create({
        _id: userId,
        homeLocation: toPoint(homeLocation),
        ...rest,
      });
    } catch (error) {
      throw asDuplicateError(error);
    }
  }

  async existsByNicHash(nicHash: string): Promise<boolean> {
    return (await CitizenProfileModel.exists({ nicHash })) !== null;
  }

  async findByUserId(userId: string): Promise<CitizenProfile | null> {
    const doc = await CitizenProfileModel.findById(userId).lean();
    return doc ? toProfile(doc) : null;
  }

  async findById(citizenId: string): Promise<CitizenProfileView | null> {
    const doc = await CitizenProfileModel.findById(citizenId).select(NO_NIC).lean();
    return doc ? toView(doc) : null;
  }

  async findByDistrict(district: District): Promise<CitizenProfileView[]> {
    const docs = await CitizenProfileModel.find({ district }).select(NO_NIC).lean();
    return docs.map(toView);
  }

  async findByRiverBasin(riverBasinId: string): Promise<CitizenProfileView[]> {
    const docs = await CitizenProfileModel.find({ riverBasinId }).select(NO_NIC).lean();
    return docs.map(toView);
  }

  async findWithinPolygon(ring: readonly GeoPoint[]): Promise<CitizenProfileView[]> {
    const docs = await CitizenProfileModel.find({
      homeLocation: {
        $geoWithin: { $geometry: { type: 'Polygon', coordinates: [closedRing(ring)] } },
      },
    })
      .select(NO_NIC)
      .lean();
    return docs.map(toView);
  }
}
