import type { CitizenProfileReader } from '@shared/auth';
import type { CitizenDirectory } from '../application/ports';
import type { Recipient } from '../domain/Recipient';
import type { TargetArea } from '../domain/TargetArea';
import { toRecipient } from './mappers';

/**
 * UC-1 step 8 (UCD-12a, SD1-03): the citizens whose registered address lies in an area, read through the
 * shared registered-citizens port that self-registration fills. A river basin is matched by the basin
 * derived from each citizen's home location when they registered; a district by their registered district.
 */
export class MongoCitizenDirectory implements CitizenDirectory {
  constructor(private readonly profiles: CitizenProfileReader) {}

  async findInArea(area: TargetArea): Promise<Recipient[]> {
    const views =
      area.type === 'RIVER_BASIN'
        ? await this.profiles.findByRiverBasin(area.areaId)
        : await this.profiles.findByDistrict(area.district);
    return views.map(toRecipient);
  }
}
