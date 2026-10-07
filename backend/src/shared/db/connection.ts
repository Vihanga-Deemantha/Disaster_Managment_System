import mongoose from 'mongoose';

/** Hides `user:password@` so a connection string can be shown in an error or a log. */
export const redactMongoUri = (uri: string): string => uri.replace(/\/\/[^@/]*@/, '//***@');

export async function connectMongo(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  } catch (cause) {
    throw new Error(
      `Cannot reach MongoDB at ${redactMongoUri(uri)}. Start one with \`docker compose up -d mongo\` ` +
        'or point MONGODB_URI at a MongoDB Atlas connection string (see README).',
      { cause },
    );
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
