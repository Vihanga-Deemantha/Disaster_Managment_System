type Shape =
  | { readonly d: string }
  | { readonly circle: readonly [cx: number, cy: number, r: number] }
  | { readonly rect: readonly [x: number, y: number, width: number, height: number, rx: number] };

/** Line icons (24 x 24 grid, 2px stroke). Kept inline so they work offline and take the text colour. */
const ICONS = {
  phone: [
    {
      d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
    },
  ],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  checkCircle: [{ d: 'M21.801 10A10 10 0 1 1 17 3.335' }, { d: 'm9 11 3 3L22 4' }],
  arrowRight: [{ d: 'M5 12h14' }, { d: 'm12 5 7 7-7 7' }],
  arrowLeft: [{ d: 'm12 19-7-7 7-7' }, { d: 'M19 12H5' }],
  alertTriangle: [
    { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { d: 'M12 9v4' },
    { d: 'M12 17h.01' },
  ],
  alertCircle: [{ circle: [12, 12, 10] }, { d: 'M12 8v4' }, { d: 'M12 16h.01' }],
  info: [{ circle: [12, 12, 10] }, { d: 'M12 16v-4' }, { d: 'M12 8h.01' }],
  mapPin: [
    {
      d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
    },
    { circle: [12, 10, 3] },
  ],
  lock: [{ rect: [3, 11, 18, 11, 2] }, { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  shield: [
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
  ],
  offline: [
    { d: 'M12 20h.01' },
    { d: 'M8.5 16.429a5 5 0 0 1 7 0' },
    { d: 'M5 12.859a10 10 0 0 1 5.17-2.69' },
    { d: 'M19 12.859a10 10 0 0 0-2.007-1.523' },
    { d: 'M2 8.82a15 15 0 0 1 4.177-2.643' },
    { d: 'M22 8.82a15 15 0 0 0-11.288-3.764' },
    { d: 'm2 2 20 20' },
  ],
  bell: [
    { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' },
    { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' },
  ],
  users: [
    { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { d: 'M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8' },
    { d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

function ShapeElement({ shape }: { shape: Shape }) {
  if ('d' in shape) return <path d={shape.d} />;
  if ('circle' in shape) {
    const [cx, cy, r] = shape.circle;
    return <circle cx={cx} cy={cy} r={r} />;
  }
  const [x, y, width, height, rx] = shape.rect;
  return <rect x={x} y={y} width={width} height={height} rx={rx} />;
}

/** A decorative icon: hidden from screen readers, so the text next to it must carry the meaning. */
export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const shapes: readonly Shape[] = ICONS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {shapes.map((shape, index) => (
        <ShapeElement key={index} shape={shape} />
      ))}
    </svg>
  );
}
