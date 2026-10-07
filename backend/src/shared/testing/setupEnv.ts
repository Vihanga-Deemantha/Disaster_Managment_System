/**
 * Jest setup: tests never read `.env`, so they cannot depend on one developer's machine.
 * These values are public test fixtures, not secrets.
 */
import { TEST_JWT_SECRET } from './constants';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
process.env.NIC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.NIC_HASH_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/safezone_unit_tests_unused';
process.env.CORS_ORIGINS = 'http://localhost:5173';
