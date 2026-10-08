import { Link } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { LanguagePills } from '@/shared/i18n/LanguagePills';
import { BrandMark } from '@/shared/layout/BrandMark';
import { HOTLINE, HOTLINE_HREF } from '@/shared/layout/hotline';
import { buttonClasses } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';

/** The thin navy strip above the header: who runs the service, the hotline, and the language choice. */
function TopBar() {
  const t = useT();
  return (
    <div className="bg-navy-900 text-white">
      <div className="mx-auto flex min-h-10 max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-1.5 text-[12.5px]">
        <p className="text-navy-100">{t('landing.topbar.official')}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={HOTLINE_HREF}
            className="flex items-center gap-1.5 font-semibold text-white hover:text-accent-400"
          >
            <Icon name="phone" size={14} strokeWidth={2.2} />
            <span>
              {t('landing.hotline.label')}{' '}
              <strong className="font-extrabold text-accent-400">{HOTLINE}</strong>
            </span>
          </a>
          <span aria-hidden="true" className="hidden h-4 w-px bg-navy-700 sm:block" />
          <LanguagePills tone="dark" />
        </div>
      </div>
    </div>
  );
}

const NAV_LINK =
  'flex min-h-11 items-center rounded-[10px] px-[11px] text-ink hover:bg-paper hover:text-accent-600';

/**
 * The section links. Tamil words are long: with them the header needs about 1090px, so Tamil gets the
 * links later than English and Sinhala (which fit from 1024px) rather than wrapping onto a second row.
 */
function SiteNav() {
  const t = useT();
  return (
    <nav
      aria-label={t('landing.nav.label')}
      className="ml-auto hidden items-center text-[14.5px] font-semibold whitespace-nowrap lg:[&:not(:lang(ta))]:flex min-[1160px]:flex"
    >
      <a href="#what-we-do" className={NAV_LINK}>
        {t('landing.nav.whatWeDo')}
      </a>
      <Link to="/hazard-reports" className={NAV_LINK}>
        {t('landing.nav.report')}
      </Link>
      <a href="#about" className={NAV_LINK}>
        {t('landing.nav.about')}
      </a>
    </nav>
  );
}

/** The top bar plus the sticky header with the logo, the section links and the sign-in buttons. */
export function LandingHeader() {
  const t = useT();
  return (
    <>
      <TopBar />
      <header className="sticky top-0 z-20 border-b border-line-soft bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-[76px] max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-5 sm:px-6">
          <Link to="/" className="flex-none rounded-lg">
            <BrandMark
              tagline
              taglineClass="hidden min-[1260px]:block min-[1260px]:[&:lang(ta)]:hidden"
            />
          </Link>
          <SiteNav />
          <div className="ml-auto flex flex-none items-center gap-1.5 lg:[&:not(:lang(ta))]:ml-0 min-[1160px]:ml-0">
            <Link to="/login" className={buttonClasses('ghost')}>
              {t('landing.nav.signIn')}
            </Link>
            <Link to="/register" className={buttonClasses('primary')}>
              {t('landing.nav.register')}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
