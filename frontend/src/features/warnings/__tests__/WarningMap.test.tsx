import { render, screen } from '@testing-library/react';
import { DISTRICT_RADIUS_METRES, WarningMap, boundsOf } from '../WarningMap';
import { aBasin, aDistrict } from '../testing/fixtures';

vi.mock('react-leaflet', async () => (await import('../testing/mockMap')).reactLeafletMock);

describe('UC-1 UCD-12a: boundsOf (what the map zooms to)', () => {
  it('is a box around a district’s centre when it has no drawn boundary', () => {
    const [[south, west], [north, east]] = boundsOf([aDistrict()]);

    expect(south).toBeCloseTo(6.9473);
    expect(north).toBeCloseTo(7.2273);
    expect(west).toBeCloseTo(79.8525);
    expect(east).toBeCloseTo(80.1325);
  });

  it('is the corners of a river basin’s outline', () => {
    expect(boundsOf([aBasin()])).toEqual([
      [6.8, 79.9],
      [7.1, 80.3],
    ]);
  });

  it('treats an empty outline like no outline at all', () => {
    expect(boundsOf([aDistrict({ boundary: [] })])).toEqual(boundsOf([aDistrict()]));
  });

  it('holds every area when a warning has more than one', () => {
    const [[south, west], [north, east]] = boundsOf([aDistrict(), aBasin()]);

    expect([south, west]).toEqual([expect.closeTo(6.8), expect.closeTo(79.8525)]);
    expect([north, east]).toEqual([expect.closeTo(7.2273), expect.closeTo(80.3)]);
  });
});

describe('UC-1 screen 2: WarningMap', () => {
  it('draws nothing for a warning with no area', () => {
    const { container } = render(<WarningMap areas={[]} label="Map" legend="Key" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('draws a district without a boundary as a circle on its centre, over street tiles', () => {
    render(
      <WarningMap
        areas={[aDistrict()]}
        label="Map of the target area"
        legend="Affected area (Gampaha)"
      />,
    );

    const map = screen.getByRole('group', { name: 'Map of the target area' });
    expect(map).toBeInTheDocument();
    expect(screen.getByTestId('tiles')).toHaveAttribute(
      'data-url',
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
    const circle = screen.getByTestId('circle');
    expect(circle).toHaveAttribute('data-center', JSON.stringify([7.0873, 79.9925]));
    expect(circle).toHaveAttribute('data-radius', String(DISTRICT_RADIUS_METRES));
    expect(screen.queryByTestId('polygon')).not.toBeInTheDocument();
  });

  it('names the red area in a key on the map, so the colour is never the only clue', () => {
    render(<WarningMap areas={[aDistrict()]} label="Map" legend="Affected area (Gampaha)" />);

    expect(screen.getByText('Affected area (Gampaha)')).toBeInTheDocument();
  });

  it('draws a river basin as its real outline', () => {
    render(<WarningMap areas={[aBasin()]} label="Map" legend="Key" />);

    expect(screen.getByTestId('polygon')).toHaveAttribute(
      'data-positions',
      JSON.stringify([
        [6.8, 79.9],
        [6.8, 80.3],
        [7.1, 80.3],
      ]),
    );
    expect(screen.queryByTestId('circle')).not.toBeInTheDocument();
  });

  it('draws an empty outline as a circle, since there is nothing to outline', () => {
    render(<WarningMap areas={[aDistrict({ boundary: [] })]} label="Map" legend="Key" />);

    expect(screen.getByTestId('circle')).toBeInTheDocument();
    expect(screen.queryByTestId('polygon')).not.toBeInTheDocument();
  });

  it('zooms to every area at once', () => {
    render(<WarningMap areas={[aDistrict(), aBasin()]} label="Map" legend="Key" />);

    expect(screen.getAllByTestId('circle')).toHaveLength(1);
    expect(screen.getAllByTestId('polygon')).toHaveLength(1);
    expect(JSON.parse(screen.getByTestId('map').dataset.bounds as string)).toEqual([
      [expect.closeTo(6.8), expect.closeTo(79.8525)],
      [expect.closeTo(7.2273), expect.closeTo(80.3)],
    ]);
  });
});
