import { render } from '@testing-library/react';
import { HAZARD_TYPES, SEVERITIES } from '@contracts/enums';
import { HazardIcon, HazardTile } from '../HazardIcon';

describe('HazardIcon', () => {
  it.each(HAZARD_TYPES)('draws a decorative line icon for %s', (hazard) => {
    const { container } = render(<HazardIcon hazard={hazard} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '18');
    expect(svg?.children.length).toBeGreaterThan(0);
  });

  it('takes a size', () => {
    const { container } = render(<HazardIcon hazard="FLOOD" size={30} />);

    expect(container.querySelector('svg')).toHaveAttribute('width', '30');
  });

  it('gives the hazards that look alike different icons where it can', () => {
    const shapeOf = (hazard: (typeof HAZARD_TYPES)[number]): string =>
      render(<HazardIcon hazard={hazard} />).container.innerHTML;

    expect(shapeOf('LANDSLIDE')).not.toBe(shapeOf('FLOOD'));
    expect(shapeOf('DROUGHT')).not.toBe(shapeOf('LIGHTNING'));
    expect(shapeOf('CYCLONE')).not.toBe(shapeOf('FLOOD'));
  });
});

describe('HazardTile', () => {
  it.each([
    ['LOW', 'bg-info-100'],
    ['MEDIUM', 'bg-warning-100'],
    ['HIGH', 'bg-danger-100'],
    ['CRITICAL', 'bg-danger-100'],
  ] as const)('is tinted by how severe the %s warning is', (severity, tint) => {
    const { container } = render(<HazardTile hazard="FLOOD" severity={severity} />);

    expect(container.firstElementChild).toHaveClass(tint);
    expect(container.querySelector('svg')).toHaveAttribute('width', '26');
  });

  it('has a tint for every severity there is', () => {
    for (const severity of SEVERITIES) {
      const { container } = render(<HazardTile hazard="DROUGHT" severity={severity} />);

      expect(container.firstElementChild?.className).toMatch(/bg-(info|warning|danger)-100/);
    }
  });
});
