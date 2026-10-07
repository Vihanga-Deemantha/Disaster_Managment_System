import { DuplicateError } from '../application/ports';

describe('DuplicateError (what a repository throws when a unique value is already taken)', () => {
  it.each(['phone', 'email', 'nicHash'] as const)('names the field that clashed: %s', (field) => {
    const error = new DuplicateError(field);

    expect(error.field).toBe(field);
    expect(error.message).toBe(`Duplicate ${field}`);
  });

  it('can be recognised by its name in logs and stack traces', () => {
    const error = new DuplicateError('phone');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DuplicateError');
    expect(String(error)).toBe('DuplicateError: Duplicate phone');
  });
});
