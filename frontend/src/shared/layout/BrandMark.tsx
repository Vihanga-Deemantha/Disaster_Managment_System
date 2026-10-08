import { useT } from '@/shared/i18n/I18nProvider';

/** `md` shrinks a little on phones so the header never runs out of room. */
const SIZES = {
  md: { px: 40, logo: 'h-[34px] w-[34px] sm:h-10 sm:w-10', name: 'text-lg sm:text-[21px]' },
  sm: { px: 34, logo: 'h-[34px] w-[34px]', name: 'text-lg' },
} as const;

const TONES = {
  light: { name: 'text-navy-900', accent: 'text-accent-600', tagline: 'text-ink-soft' },
  dark: { name: 'text-white', accent: 'text-accent-400', tagline: 'text-slate-200' },
} as const;

/** The product name is the same in every language, so its two words are fixed (see `app.name`). */
const WORDS = ['Safe', 'Zone'] as const;

/**
 * The logo and the two-tone "Safe Zone" wordmark. `tone` says what it sits on: dark text on a light
 * page, white text on navy. The tagline is optional because narrow headers have no room for it.
 */
export function BrandMark({
  tone = 'light',
  size = 'md',
  tagline = false,
  taglineClass = '',
}: {
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  tagline?: boolean;
  /** Extra classes for the tagline, for example to show it only on wide screens. */
  taglineClass?: string;
}) {
  const t = useT();
  const colours = TONES[tone];
  return (
    <span className="flex items-center gap-3">
      <img
        src="/favicon.svg"
        alt=""
        width={SIZES[size].px}
        height={SIZES[size].px}
        className={SIZES[size].logo}
      />
      <span className="flex flex-col gap-0.5 leading-tight">
        <span className={`${SIZES[size].name} font-extrabold tracking-tight ${colours.name}`}>
          {WORDS[0]} <span className={colours.accent}>{WORDS[1]}</span>
        </span>
        {tagline ? (
          <span className={`text-xs font-medium ${colours.tagline} ${taglineClass}`}>
            {t('app.tagline')}
          </span>
        ) : null}
      </span>
    </span>
  );
}
