import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { LanguagePills } from '@/shared/i18n/LanguagePills';
import { BrandMark } from '@/shared/layout/BrandMark';
import { HOTLINE, HOTLINE_HREF } from '@/shared/layout/hotline';
import { Icon } from '@/shared/ui/Icon';

/** Which side panel to show: sign-in and registration each have their own photo and message. */
export type AuthVariant = 'signIn' | 'register';

const SIDE_PHOTO: Record<AuthVariant, string> = {
  signIn: '/images/flood-response-at-dusk.webp',
  register: '/images/school-relief-check-in.webp',
};

function Hotline() {
  const t = useT();
  return (
    <a
      href={HOTLINE_HREF}
      className="mt-3.5 flex items-center gap-3 border-t border-white/20 pt-5 text-white hover:text-accent-400"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/10">
        <Icon name="phone" size={17} />
      </span>
      <span className="flex flex-col leading-[1.3]">
        <span className="text-[12.5px] text-slate-200">{t('auth.side.hotlineLead')}</span>
        <span className="text-[15px] font-bold">
          {t('auth.side.hotline')} <span className="text-accent-400">{HOTLINE}</span>
        </span>
      </span>
    </a>
  );
}

function SidePanel({ variant }: { variant: AuthVariant }) {
  const t = useT();
  return (
    <aside className="relative hidden max-w-[640px] flex-[0_0_46%] overflow-hidden bg-navy-900 text-white min-[900px]:flex">
      <img
        src={SIDE_PHOTO[variant]}
        alt={t(`auth.side.${variant}.alt`)}
        width={1000}
        height={1250}
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,40,72,0.55)_0%,rgba(20,40,72,0.35)_35%,rgba(20,40,72,0.92)_72%,#142848_100%)]"
      />
      <div className="relative flex flex-1 flex-col justify-between gap-10 px-11 pt-9 pb-10">
        <Link to="/" className="self-start rounded-lg">
          <BrandMark tone="dark" tagline />
        </Link>
        <div className="flex max-w-[460px] flex-col gap-[18px]">
          <p className="text-[12.5px] font-bold tracking-widest text-accent-400 uppercase">
            {t(`auth.side.${variant}.kicker`)}
          </p>
          <p className="text-[clamp(30px,3.2vw,42px)] leading-[1.12] font-extrabold tracking-[-0.025em] text-balance">
            {t(`auth.side.${variant}.title`)}
          </p>
          <ul className="mt-1 flex flex-col gap-3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="flex items-center gap-3 text-[15px]">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-600">
                  <Icon name="check" size={12} strokeWidth={3.2} />
                </span>
                {t(`auth.side.${variant}.point${n}`)}
              </li>
            ))}
          </ul>
          <Hotline />
        </div>
      </div>
    </aside>
  );
}

/**
 * The frame shared by sign-in and registration: a photo panel with the product's promise on wide
 * screens, and on the right the form, with a way back home and the language choice on top.
 */
export function AuthLayout({ variant, children }: { variant: AuthVariant; children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-screen bg-paper">
      <SidePanel variant={variant} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-5 sm:px-8">
          <Link
            to="/"
            className="hidden min-h-11 items-center gap-2 text-sm font-semibold text-navy-900 hover:text-accent-600 min-[900px]:flex"
          >
            <Icon name="arrowLeft" size={16} strokeWidth={2.2} />
            {t('auth.backHome')}
          </Link>
          <Link to="/" className="rounded-lg whitespace-nowrap min-[900px]:hidden">
            <BrandMark size="sm" />
          </Link>
          <LanguagePills />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-6 pt-4 pb-14">
          <div className="flex w-full max-w-[460px] flex-col gap-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
