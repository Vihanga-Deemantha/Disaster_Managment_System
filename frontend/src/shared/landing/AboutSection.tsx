import type { ReactNode } from 'react';
import { DISTRICTS } from '@contracts/enums';
import { useT } from '@/shared/i18n/I18nProvider';
import { HOTLINE, HOTLINE_HREF } from '@/shared/layout/hotline';
import { Icon, type IconName } from '@/shared/ui/Icon';

function Check({ children }: { children: string }) {
  return (
    <li className="flex items-center gap-2.5 text-[14.5px] font-semibold text-navy-900">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent-600 text-white">
        <Icon name="check" size={13} strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}

function Contact({
  icon,
  tone,
  children,
}: {
  icon: IconName;
  tone: 'navy' | 'paper';
  children: ReactNode;
}) {
  const colours = tone === 'navy' ? 'bg-navy-900 text-accent-400' : 'bg-paper text-accent-600';
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-12 w-12 flex-none items-center justify-center rounded-full ${colours}`}
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="flex flex-col leading-[1.3]">{children}</div>
    </div>
  );
}

/** The photo with the "25 districts" badge, beside the story of who the service is for. */
export function AboutSection() {
  const t = useT();
  return (
    <section id="about" className="scroll-mt-24 bg-white px-6 py-16 sm:py-[100px]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-x-[72px] gap-y-14">
        <div className="relative pr-12 pb-16">
          <div className="h-[460px] overflow-hidden rounded-2xl">
            <img
              src="/images/dmc-field-officer.webp"
              alt={t('landing.about.alt')}
              width={1122}
              height={1402}
              loading="lazy"
              className="h-full w-full object-cover object-[center_25%]"
            />
          </div>
          <div className="absolute right-0 bottom-0 max-w-[300px] rounded-[14px] bg-accent-600 px-[30px] py-[26px] text-white shadow-[0_20px_40px_rgba(140,72,32,0.25)]">
            <p className="text-[44px] leading-none font-extrabold tracking-[-0.02em]">
              {DISTRICTS.length}
            </p>
            <p className="mt-2 text-xl leading-[1.3] font-bold">{t('landing.about.districts')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <p className="text-[13px] font-bold tracking-[0.08em] text-accent-600 uppercase">
            {t('landing.about.kicker')}
          </p>
          <h2 className="text-[clamp(26px,3.2vw,38px)] leading-[1.2] font-extrabold tracking-[-0.02em] text-balance break-words text-navy-900">
            {t('landing.about.title')}
          </h2>
          <p className="text-[15px] leading-[1.75] text-pretty text-ink-soft">
            {t('landing.about.body')}
          </p>
          <ul className="flex flex-wrap gap-x-8 gap-y-4 border-b-2 border-line-soft pt-1 pb-6">
            <Check>{t('landing.about.offline')}</Check>
            <Check>{t('landing.about.languages')}</Check>
          </ul>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-5">
            <Contact icon="shield" tone="navy">
              <span className="text-base font-bold text-navy-900">{t('landing.about.eoc')}</span>
              <span className="text-[13px] text-ink-soft">{t('landing.about.dmc')}</span>
            </Contact>
            <span aria-hidden="true" className="hidden h-11 w-px bg-line sm:block" />
            <a href={HOTLINE_HREF} className="rounded-lg">
              <Contact icon="phone" tone="paper">
                <span className="text-[13px] font-semibold text-navy-900">
                  {t('landing.about.hotline')}
                </span>
                <span className="text-lg font-extrabold text-accent-600">{HOTLINE}</span>
              </Contact>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
