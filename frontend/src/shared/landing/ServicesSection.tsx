import { useT } from '@/shared/i18n/I18nProvider';
import { Icon, type IconName } from '@/shared/ui/Icon';

type ServiceId = 'report' | 'warn' | 'respond';

/** The three stages of the product, in the order a hazard moves through them. */
const SERVICES: readonly { id: ServiceId; icon: IconName }[] = [
  { id: 'report', icon: 'offline' },
  { id: 'warn', icon: 'bell' },
  { id: 'respond', icon: 'users' },
];

function ServiceCard({ id, icon }: { id: ServiceId; icon: IconName }) {
  const t = useT();
  return (
    <li className="flex flex-col gap-[18px] rounded-2xl border border-line-soft bg-white px-7 py-[30px] shadow-[0_10px_30px_rgba(20,40,72,0.06)]">
      <div className="flex items-center gap-3.5">
        <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-accent-600 text-white">
          <Icon name={icon} size={22} />
        </span>
        <h3 className="text-lg font-bold break-words text-navy-900">
          {t(`landing.service.${id}.title`)}
        </h3>
      </div>
      <p className="text-[14.5px] leading-[1.7] text-pretty text-ink-soft">
        {t(`landing.service.${id}.body`)}
      </p>
      <ul className="flex flex-col gap-2.5">
        {([1, 2] as const).map((n) => (
          <li key={n} className="flex items-center gap-2.5 text-sm font-medium text-ink">
            <Icon name="check" size={15} strokeWidth={2.6} className="flex-none text-accent-600" />
            {t(`landing.service.${id}.point${n}`)}
          </li>
        ))}
      </ul>
    </li>
  );
}

/** "What we do": report from the field, verified local warnings, coordinated response. */
export function ServicesSection() {
  const t = useT();
  return (
    <section
      id="what-we-do"
      className="scroll-mt-24 bg-white px-6 pt-16 pb-14 sm:pt-24 sm:pb-[88px]"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-10 flex flex-col items-center gap-2.5 text-center sm:mb-[52px]">
          <p className="text-[13px] font-bold tracking-[0.08em] text-accent-600 uppercase">
            {t('landing.what.kicker')}
          </p>
          <h2 className="max-w-[640px] text-[clamp(26px,3.4vw,40px)] leading-[1.2] font-extrabold tracking-[-0.02em] text-balance break-words text-navy-900">
            {t('landing.what.title')}
          </h2>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-6">
          {SERVICES.map((service) => (
            <ServiceCard key={service.id} {...service} />
          ))}
        </ul>
      </div>
    </section>
  );
}
