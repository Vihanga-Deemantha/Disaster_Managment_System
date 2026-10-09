import { Directory, File, Paths } from 'expo-file-system';
import type { PhotoStore } from '../offline/ports';

const folder = () => new Directory(Paths.document, 'hazard-photos');
export class FileSystemPhotoStore implements PhotoStore {
  async keep(sourceUri: string, name: string): Promise<string> {
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || name === '.' || name === '..')
      throw new Error('Invalid report photo filename.');
    const directory = folder();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const target = new File(directory, name);
    new File(sourceUri).copy(target);
    return target.uri;
  }
  async exists(uri: string): Promise<boolean> {
    return new File(uri).exists;
  }
  async discard(uri: string): Promise<void> {
    const file = new File(uri);
    if (!file.uri.startsWith(`${folder().uri.replace(/\/+$/, '')}/`))
      throw new Error('Photo is outside report storage.');
    if (file.exists) file.delete();
  }
}
