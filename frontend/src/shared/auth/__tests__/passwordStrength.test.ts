import { passwordStrength } from '../passwordStrength';

describe('passwordStrength', () => {
  it('says nothing is wrong, yet, about an empty box', () => {
    expect(passwordStrength('')).toEqual({
      level: 0,
      messageKey: 'auth.register.passwordHint',
    });
  });

  it.each([
    ['a', 1],
    ['abcde', 1],
    ['abcdef', 2],
    ['abcdefghi', 2],
  ])('calls %j too short, at level %i', (password, level) => {
    expect(passwordStrength(password)).toEqual({
      level,
      messageKey: 'auth.register.passwordShort',
    });
  });

  it('refuses to call a very common password strong, however long it is', () => {
    expect(passwordStrength('password123')).toEqual({
      level: 2,
      messageKey: 'error.PASSWORD_TOO_COMMON',
    });
    expect(passwordStrength('1234567890')).toMatchObject({
      messageKey: 'error.PASSWORD_TOO_COMMON',
    });
  });

  it('says so when it is longer than the server accepts', () => {
    expect(passwordStrength('x1'.repeat(65))).toEqual({
      level: 2,
      messageKey: 'error.PASSWORD_TOO_LONG',
    });
  });

  it('is "strong enough" from ten characters, and a step up from fourteen', () => {
    expect(passwordStrength('correcthor')).toEqual({
      level: 3,
      messageKey: 'auth.register.passwordStrong',
    });
    expect(passwordStrength('correcthorsebat')).toEqual({
      level: 4,
      messageKey: 'auth.register.passwordStrong',
    });
  });

  it('counts characters the way the server does, so Sinhala, Tamil and emoji are measured fairly', () => {
    // Five characters, although it takes ten UTF-16 units to store them: still too short.
    expect(passwordStrength('😀'.repeat(5))).toMatchObject({
      level: 1,
      messageKey: 'auth.register.passwordShort',
    });
    expect(passwordStrength('සිංහල')).toMatchObject({ messageKey: 'auth.register.passwordShort' });
    expect(passwordStrength('සිංහලසිංහල')).toMatchObject({
      level: 3,
      messageKey: 'auth.register.passwordStrong',
    });
  });
});
