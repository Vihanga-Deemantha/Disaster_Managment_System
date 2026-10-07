import mongoose from 'mongoose';
import { connectMongo, disconnectMongo, redactMongoUri } from '../connection';

afterEach(() => jest.restoreAllMocks());

describe('redactMongoUri', () => {
  it('hides credentials so a connection string can appear in an error', () => {
    expect(redactMongoUri('mongodb+srv://admin:s3cret@cluster0.example.net/safezone')).toBe(
      'mongodb+srv://***@cluster0.example.net/safezone',
    );
  });

  it('leaves a credential-free local URI alone', () => {
    expect(redactMongoUri('mongodb://127.0.0.1:27017/safezone_dev')).toBe(
      'mongodb://127.0.0.1:27017/safezone_dev',
    );
  });
});

describe('connectMongo', () => {
  it('connects with a short server-selection timeout so a missing database fails fast', async () => {
    const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

    await connectMongo('mongodb://127.0.0.1:27017/x');

    expect(connect).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/x', {
      serverSelectionTimeoutMS: 5000,
    });
  });

  it('explains how to get a database when it cannot connect, without leaking the password', async () => {
    jest.spyOn(mongoose, 'connect').mockRejectedValue(new Error('ECONNREFUSED'));

    const failure = connectMongo('mongodb://user:hunter2@127.0.0.1:27017/x');

    await expect(failure).rejects.toThrow(/docker compose up -d mongo/);
    await expect(failure).rejects.not.toThrow(/hunter2/);
    await expect(failure).rejects.toMatchObject({ cause: expect.any(Error) });
  });
});

describe('disconnectMongo', () => {
  it('closes the shared connection', async () => {
    const disconnect = jest.spyOn(mongoose, 'disconnect').mockResolvedValue();

    await disconnectMongo();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
