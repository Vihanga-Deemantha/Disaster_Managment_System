import mongoose, { Schema } from 'mongoose';
import {
  DISTRICTS,
  LANGUAGES,
  ORGANIZATION_TYPES,
  ROLES,
  type District,
  type Language,
  type OrganizationType,
  type Role,
} from '../../contracts/enums';
import type { UserStatus } from '../domain/types';

export interface UserDoc {
  _id: string;
  role: Role;
  displayName: string;
  email?: string;
  phone?: string;
  passwordHash: string;
  status: UserStatus;
  organizationId?: string;
  organizationType?: OrganizationType;
  district?: District;
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    displayName: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], required: true },
    organizationId: String,
    organizationType: { type: String, enum: ORGANIZATION_TYPES },
    district: { type: String, enum: DISTRICTS },
    createdAt: { type: Date, required: true },
  },
  { collection: 'users', versionKey: false },
);
// Partial indexes: staff have no phone and citizens have no email, and "missing" must not collide.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
);

export const UserModel = mongoose.model<UserDoc>('User', userSchema);

export interface CitizenProfileDoc {
  _id: string;
  nicEncrypted: string;
  nicHash: string;
  fullName: string;
  phone: string;
  homeLocation: { type: 'Point'; coordinates: [number, number] };
  addressLine?: string;
  district: District;
  riverBasinId?: string;
  preferredLanguage: Language;
  deviceToken?: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  email?: string;
}

const citizenProfileSchema = new Schema<CitizenProfileDoc>(
  {
    _id: { type: String, required: true },
    nicEncrypted: { type: String, required: true },
    nicHash: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    homeLocation: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true },
    },
    addressLine: String,
    district: { type: String, enum: DISTRICTS, required: true, index: true },
    riverBasinId: { type: String, index: true },
    preferredLanguage: { type: String, enum: LANGUAGES, required: true },
    deviceToken: String,
    whatsappOptIn: { type: Boolean, required: true },
    emailOptIn: { type: Boolean, required: true },
    email: String,
  },
  { collection: 'citizen_profiles', versionKey: false },
);
citizenProfileSchema.index({ homeLocation: '2dsphere' });

export const CitizenProfileModel = mongoose.model<CitizenProfileDoc>(
  'CitizenProfile',
  citizenProfileSchema,
);

export interface RefreshSessionDoc {
  _id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  authenticatedAt: Date;
  rotatedAt?: Date | null;
  revokedAt?: Date | null;
  userAgent: string;
  ip: string;
}

const refreshSessionSchema = new Schema<RefreshSessionDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    // Rows are kept for an hour past the family's hard cap so reuse detection still works, then cleaned up.
    absoluteExpiresAt: { type: Date, required: true, expires: 60 * 60 },
    authenticatedAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, required: true },
    ip: { type: String, required: true },
  },
  { collection: 'refresh_sessions', versionKey: false },
);

export const RefreshSessionModel = mongoose.model<RefreshSessionDoc>(
  'RefreshSession',
  refreshSessionSchema,
);

export interface LoginThrottleDoc {
  _id: string;
  failures: number;
  lastFailedAt: Date;
}

const loginThrottleSchema = new Schema<LoginThrottleDoc>(
  {
    _id: { type: String, required: true },
    failures: { type: Number, required: true },
    // The counter forgets an identifier after an hour without failures.
    lastFailedAt: { type: Date, required: true, expires: 60 * 60 },
  },
  { collection: 'login_throttles', versionKey: false },
);

export const LoginThrottleModel = mongoose.model<LoginThrottleDoc>(
  'LoginThrottle',
  loginThrottleSchema,
);
