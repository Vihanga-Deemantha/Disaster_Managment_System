import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskPhotoStorage } from '../infrastructure/DiskPhotoStorage';
import { jpeg } from '../testing/builders';

let directory: string;
let storage: DiskPhotoStorage;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'uc3-photos-'));
  storage = new DiskPhotoStorage(join(directory, 'nested'));
});
afterEach(async () => rm(directory, { recursive: true, force: true }));

describe('DiskPhotoStorage.save', () => {
  it('writes the bytes under the key and returns the url, type and size', async () => {
    const photo = jpeg(20);
    const stored = await storage.save('report-1', photo);
    expect(stored).toEqual({
      url: '/api/hazard-reports/photos/report-1.jpg',
      mime: 'image/jpeg',
      bytes: 20,
    });
    expect([...readFileSync(join(directory, 'nested', 'report-1.jpg'))]).toEqual([
      ...photo.content,
    ]);
  });

  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('uses the %s extension .%s', async (mimeType, extension) => {
    const stored = await storage.save('k-1', { content: new Uint8Array(4), mimeType });
    expect(stored.url.endsWith(`k-1.${extension}`)).toBe(true);
  });

  it('a new key never overwrites an older photo of the same report', async () => {
    await storage.save('report-1', jpeg(8));
    await storage.save('report-1-update', jpeg(9));
    expect(existsSync(join(directory, 'nested', 'report-1.jpg'))).toBe(true);
    expect(existsSync(join(directory, 'nested', 'report-1-update.jpg'))).toBe(true);
  });

  it('refuses an unsupported type instead of writing a file nobody can serve', async () => {
    await expect(
      storage.save('k-1', { content: new Uint8Array(4), mimeType: 'image/gif' }),
    ).rejects.toThrow('Cannot store a image/gif photo');
  });

  it.each(['../escape', 'a/b', 'a.b', ''])('refuses the unsafe key "%s"', async (key) => {
    await expect(storage.save(key, jpeg())).rejects.toThrow('Cannot store');
    expect(existsSync(join(directory, 'escape.jpg'))).toBe(false);
  });
});

describe('DiskPhotoStorage.remove', () => {
  it('deletes the stored file', async () => {
    const stored = await storage.save('report-1', jpeg());
    await storage.remove(stored);
    expect(existsSync(join(directory, 'nested', 'report-1.jpg'))).toBe(false);
  });

  it('is silent when the file is already gone', async () => {
    const stored = await storage.save('report-1', jpeg());
    await storage.remove(stored);
    await expect(storage.remove(stored)).resolves.toBeUndefined();
  });

  it('never deletes a file outside its own directory, whatever the url says', async () => {
    const secret = join(directory, 'secret.txt');
    writeFileSync(secret, 'keep me');
    await storage.remove({
      url: '/api/hazard-reports/photos/../secret.txt',
      mime: 'image/jpeg',
      bytes: 1,
    });
    expect(existsSync(secret)).toBe(true);
  });
});

describe('DiskPhotoStorage.resolve', () => {
  it('maps one of our file names to its path', () => {
    expect(storage.resolve('abc-1.jpg')).toBe(join(directory, 'nested', 'abc-1.jpg'));
  });

  it.each(['../secret.env', 'a.exe', 'a/b.jpg', '.jpg', 'abc.JPG'])('refuses "%s"', (name) => {
    expect(storage.resolve(name)).toBeUndefined();
  });
});
