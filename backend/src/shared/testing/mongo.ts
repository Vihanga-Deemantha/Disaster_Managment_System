import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

export interface TestMongo {
  uri: string;
  stop(): Promise<void>;
}

/**
 * A throwaway MongoDB for repository tests. By default it starts `mongodb-memory-server`. On a
 * network that blocks the binary download, set MONGODB_TEST_URI to any running MongoDB and the tests
 * use a uniquely named database on it instead (dropped afterwards).
 */
export async function startTestMongo(): Promise<TestMongo> {
  const external = process.env.MONGODB_TEST_URI;
  if (external) {
    const uri = external.replace(/\/?$/, `/safezone_test_${randomUUID().slice(0, 8)}`);
    return {
      uri,
      stop: async () => {
        await mongoose.connection.dropDatabase();
      },
    };
  }
  const server = await MongoMemoryServer.create();
  return { uri: server.getUri(), stop: async () => void (await server.stop()) };
}

/** Connects mongoose to a fresh test database and returns a function that tears it all down. */
export async function connectTestMongo(): Promise<() => Promise<void>> {
  const mongo = await startTestMongo();
  await mongoose.connect(mongo.uri);
  return async () => {
    await mongo.stop();
    await mongoose.disconnect();
  };
}

/** Empties every collection between tests while keeping indexes. */
export async function clearDatabase(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
}
