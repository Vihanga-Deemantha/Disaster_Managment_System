type Shape =
  | { readonly d: string }
  | { readonly circle: readonly [cx: number, cy: number, r: number] }
  | { readonly rect: readonly [x: number, y: number, width: number, height: number, rx: number] };

/** The outline of the shield, shared by the four icons that are a shield with something on it. */
const SHIELD =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

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
  shield: [{ d: SHIELD }],
  shieldAlert: [{ d: SHIELD }, { d: 'M12 8v4' }, { d: 'M12 16h.01' }],
  shieldCheck: [{ d: SHIELD }, { d: 'm9 12 2 2 4-4' }],
  shieldX: [{ d: SHIELD }, { d: 'm14.5 9.5-5 5' }, { d: 'm9.5 9.5 5 5' }],
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
  user: [{ d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }, { circle: [12, 7, 4] }],
  search: [{ circle: [11, 11, 8] }, { d: 'm21 21-4.3-4.3' }],
  sliders: [
    { d: 'M21 4h-7' },
    { d: 'M10 4H3' },
    { d: 'M21 12h-9' },
    { d: 'M8 12H3' },
    { d: 'M21 20h-5' },
    { d: 'M12 20H3' },
    { d: 'M14 2v4' },
    { d: 'M8 10v4' },
    { d: 'M16 18v4' },
  ],
  calendar: [{ d: 'M8 2v4' }, { d: 'M16 2v4' }, { rect: [3, 4, 18, 18, 2] }, { d: 'M3 10h18' }],
  clock: [{ circle: [12, 12, 10] }, { d: 'M12 6v6l4 2' }],
  send: [
    {
      d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
    },
    { d: 'm21.854 2.147-10.94 10.939' },
  ],
  x: [{ d: 'M18 6 6 18' }, { d: 'm6 6 12 12' }],
  chevronDown: [{ d: 'm6 9 6 6 6-6' }],
  chevronLeft: [{ d: 'm15 18-6-6 6-6' }],
  chevronRight: [{ d: 'm9 18 6-6-6-6' }],
  menu: [{ d: 'M4 6h16' }, { d: 'M4 12h16' }, { d: 'M4 18h16' }],
  logOut: [
    { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
    { d: 'm16 17 5-5-5-5' },
    { d: 'M21 12H9' },
  ],
  fileText: [
    { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    { d: 'M14 2v4a2 2 0 0 0 2 2h4' },
    { d: 'M10 9H8' },
    { d: 'M16 13H8' },
    { d: 'M16 17H8' },
  ],
  inbox: [
    { d: 'M22 12h-6l-2 3h-4l-2-3H2' },
    {
      d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    },
  ],
  radio: [
    { d: 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9' },
    { d: 'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5' },
    { circle: [12, 12, 2] },
    { d: 'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5' },
    { d: 'M19.1 4.9C23 8.8 23 15.1 19.1 19' },
  ],
  barChart: [
    { d: 'M3 3v16a2 2 0 0 0 2 2h16' },
    { d: 'M18 17V9' },
    { d: 'M13 17V5' },
    { d: 'M8 17v-3' },
  ],
  clipboardList: [
    { rect: [8, 2, 8, 4, 1] },
    { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { d: 'M12 11h4' },
    { d: 'M12 16h4' },
    { d: 'M8 11h.01' },
    { d: 'M8 16h.01' },
  ],
  package: [
    {
      d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
    },
    { d: 'M12 22V12' },
    { d: 'm3.29 7 8.71 5 8.71-5' },
    { d: 'm7.5 4.27 9 5.15' },
  ],
  dot: [{ circle: [12, 12, 3] }],
  waves: [
    {
      d: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
    },
    {
      d: 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
    },
    {
      d: 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
    },
  ],
  mountain: [{ d: 'm8 3 4 8 5-5 5 15H2L8 3z' }],
  sun: [
    { circle: [12, 12, 4] },
    { d: 'M12 2v2' },
    { d: 'M12 20v2' },
    { d: 'm4.93 4.93 1.41 1.41' },
    { d: 'm17.66 17.66 1.41 1.41' },
    { d: 'M2 12h2' },
    { d: 'M20 12h2' },
    { d: 'm6.34 17.66-1.41 1.41' },
    { d: 'm19.07 4.93-1.41 1.41' },
  ],
  zap: [
    {
      d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
    },
  ],
  tornado: [
    { d: 'M21 4H3' },
    { d: 'M18 8H6' },
    { d: 'M19 12H9' },
    { d: 'M16 16h-6' },
    { d: 'M11 20H9' },
  ],
  messageSquare: [{ d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }],
  messageCircle: [{ d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
  mail: [{ rect: [2, 4, 20, 16, 2] }, { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }],
  minus: [{ d: 'M5 12h14' }],
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
