import mongoose, { Schema } from 'mongoose';
import { DISTRICTS, type District } from '../contracts/enums';
import type { GeoPoint } from './GeoPoint';

/** Finds the river basin a point lies in, so a citizen's basin is derived from their home location. */
export interface RiverBasinLocator {
  locate(point: GeoPoint): Promise<string | undefined>;
}

export interface RiverBasinDoc {
  _id: string;
  name: string;
  districts: District[];
  /** GeoJSON polygon, `[lng, lat]` pairs, first ring closed. */
  boundary: { type: 'Polygon'; coordinates: number[][][] };
}

const riverBasinSchema = new Schema<RiverBasinDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    districts: [{ type: String, enum: DISTRICTS }],
    boundary: {
      type: { type: String, enum: ['Polygon'], required: true },
      coordinates: { type: [[[Number]]], required: true },
    },
  },
  { collection: 'river_basins', versionKey: false },
);
riverBasinSchema.index({ boundary: '2dsphere' });

/** Shared by auth (derive a citizen's basin) and UC-1 (target a basin), so there is one source of truth. */
export const RiverBasinModel = mongoose.model<RiverBasinDoc>('RiverBasin', riverBasinSchema);

export class MongoRiverBasinLocator implements RiverBasinLocator {
  async locate(point: GeoPoint): Promise<string | undefined> {
    const basin = await RiverBasinModel.findOne({
      boundary: {
        $geoIntersects: { $geometry: { type: 'Point', coordinates: [point.lng, point.lat] } },
      },
    })
      .select('_id')
      .lean();
    return basin?._id;
  }
}
