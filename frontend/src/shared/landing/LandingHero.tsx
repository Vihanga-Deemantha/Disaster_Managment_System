import { Link } from 'react-router';
import { useT } from '@/shared/i18n/I18nProvider';
import { buttonClasses } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';

/**
 * The first thing a visitor sees. The photo carries a navy veil: a fade from left to right on wide
 * screens (the text sits on the left), an even veil on phones where the text spans the whole width.
 * Sinhala and Tamil are wider and taller than English at the same size, so their headline is a step
 * smaller; otherwise it would run to five lines and push the hero well past the first screen.
 */
export function LandingHero() {
  const t = useT();
  return (
    <section className="relative flex min-h-[600px] items-center overflow-hidden bg-navy-900 md:min-h-[680px] lg:min-h-[760px]">
      <img
        src="/images/safezone-hero.webp"
        alt={t('landing.hero.alt')}
        width={1672}
        height={941}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-navy-900/80 md:bg-transparent md:bg-[linear-gradient(90deg,rgba(20,40,72,0.94)_0%,rgba(20,40,72,0.78)_45%,rgba(20,40,72,0.15)_100%)]"
      />
      <div className="relative mx-auto w-full max-w-[1200px] px-6 py-20 lg:py-28">
        <div className="flex max-w-[680px] flex-col gap-6 lg:max-w-[760px] lg:gap-7">
          <h1 className="text-[clamp(34px,6.4vw,78px)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance break-words text-white [&:lang(si)]:text-[clamp(30px,4.4vw,56px)] [&:lang(si)]:leading-[1.25] [&:lang(ta)]:text-[clamp(30px,4.4vw,56px)] [&:lang(ta)]:leading-[1.25]">
            {t('landing.hero.title')}
          </h1>
          <p className="max-w-[560px] text-[17px] leading-[1.65] text-pretty text-slate-200 md:max-w-[620px] md:text-[19px]">
            {t('landing.hero.body')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-3">
            <Link to="/hazard-reports" className={buttonClasses('primary', 'lg')}>
              <Icon name="alertTriangle" size={18} />
              {t('landing.nav.report')}
            </Link>
            <Link to="/register" className={buttonClasses('onDark', 'lg')}>
              {t('auth.login.registerLink')}
              <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
