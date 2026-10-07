import { Link } from 'react-router';
import { useT, type TranslationParams } from '@/shared/i18n/I18nProvider';
import type { MessageKey } from '@/shared/i18n/messages.en';
import { BrandMark } from '@/shared/layout/BrandMark';
import { HOTLINE } from '@/shared/layout/hotline';

interface FooterLink {
  to: string;
  labelKey: MessageKey;
}

const PUBLIC_LINKS: readonly FooterLink[] = [
  { to: '/hazard-reports', labelKey: 'landing.nav.report' },
  { to: '/register', labelKey: 'auth.login.registerLink' },
];

/** The same entries the signed-in sidebar has, so an official can jump straight to their screen. */
const OFFICIAL_LINKS: readonly FooterLink[] = [
  { to: '/login', labelKey: 'landing.nav.signIn' },
  { to: '/warnings', labelKey: 'nav.warnings' },
  { to: '/resources', labelKey: 'nav.resources' },
  { to: '/analytics', labelKey: 'nav.analytics' },
];

function LinkColumn({ titleKey, links }: { titleKey: MessageKey; links: readonly FooterLink[] }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="font-bold text-white">{t(titleKey)}</h2>
      <ul className="flex flex-col gap-2.5">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="text-slate-300 hover:text-accent-400">
              {t(link.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Navy footer: the brand, two columns of links, and the copyright line with the hotline. */
export function LandingFooter() {
  const t = useT();
  const year: TranslationParams = { year: new Date().getFullYear() };
  return (
    <footer className="mt-auto bg-navy-900 px-6 pt-14 pb-7 text-slate-300">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10">
        <div className="flex flex-wrap justify-between gap-10">
          <div className="flex max-w-[340px] flex-col gap-3">
            <BrandMark tone="dark" />
            <p className="text-sm leading-[1.7]">{t('app.tagline')}</p>
          </div>
          <nav aria-label={t('landing.footer.label')} className="flex flex-wrap gap-14 text-sm">
            <LinkColumn titleKey="landing.footer.public" links={PUBLIC_LINKS} />
            <LinkColumn titleKey="landing.footer.officials" links={OFFICIAL_LINKS} />
          </nav>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-navy-800 pt-5 text-[13px]">
          <p>{t('landing.footer.copyright', year)}</p>
          <p>{t('landing.footer.hotline', { number: HOTLINE })}</p>
        </div>
      </div>
    </footer>
  );
}
