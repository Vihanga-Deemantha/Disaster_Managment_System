import * as Crypto from 'expo-crypto';
import type { Clock, IdGenerator } from '../offline/ports';
export const systemClock: Clock = { now: () => new Date() };
export const uuidGenerator: IdGenerator = { next: () => Crypto.randomUUID() };
