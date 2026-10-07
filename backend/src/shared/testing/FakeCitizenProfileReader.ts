import type {
  CitizenProfileReader,
  CitizenProfileView,
} from '../auth/application/CitizenProfileReader';
import type { District } from '../contracts/enums';
import { pointInRing, type GeoPoint } from '../geo/GeoPoint';

/** Test stand-in for the registered-citizens port: load it with the citizens a test needs. */
export class FakeCitizenProfileReader implements CitizenProfileReader {
  private readonly citizens: CitizenProfileView[] = [];

  constructor(...initial: CitizenProfileView[]) {
    this.add(...initial);
  }

  add(...citizens: CitizenProfileView[]): void {
    this.citizens.push(...citizens);
  }

  async findById(citizenId: string): Promise<CitizenProfileView | null> {
    return this.citizens.find((citizen) => citizen.citizenId === citizenId) ?? null;
  }

  async findByDistrict(district: District): Promise<CitizenProfileView[]> {
    return this.citizens.filter((citizen) => citizen.district === district);
  }

  async findByRiverBasin(riverBasinId: string): Promise<CitizenProfileView[]> {
    return this.citizens.filter((citizen) => citizen.riverBasinId === riverBasinId);
  }

  async findWithinPolygon(ring: readonly GeoPoint[]): Promise<CitizenProfileView[]> {
    return this.citizens.filter((citizen) => pointInRing(citizen.homeLocation, ring));
  }
}
