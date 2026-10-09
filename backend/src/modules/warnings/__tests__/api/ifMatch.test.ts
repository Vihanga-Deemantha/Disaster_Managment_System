import { parseIfMatch } from '../../api/ifMatch';

describe('UC-1 A2: parseIfMatch (the version the officer was looking at)', () => {
  it.each([
    ['3', 3],
    ['"3"', 3],
    ['W/"3"', 3],
    ['  7  ', 7],
    ['  W/"12" ', 12],
    ['0', 0],
  ])('reads %j as version %d', (header, version) => {
    expect(parseIfMatch(header)).toBe(version);
  });

  it.each(['', ' ', 'abc', '3.5', '-1', '3"x', 'W/3x', '*', '"3", "4"', 'w/"3"'])(
    'ignores %j, so the body’s version (or the request for one) takes over',
    (header) => {
      expect(parseIfMatch(header)).toBeUndefined();
    },
  );

  it('ignores a missing header', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
  });
});
