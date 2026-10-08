import type { Channel } from '@contracts/enums';
import { useT } from '@/shared/i18n/I18nProvider';
import { CheckboxField } from '@/shared/ui/Field';
import { OPTIONAL_CHANNELS, type OptionalChannel, type RecipientEstimate } from './types';

const ALWAYS_ON: readonly Channel[] = ['PUSH', 'SMS'];

/**
 * Who a warning would reach, before the officer decides (SD1-03): the registered citizens in the area,
 * how many each channel can reach, and the two channels that need the officer's say-so (step 11).
 */
export function AudiencePanel({
  recipients,
  optional,
  onToggle,
  locked,
}: {
  recipients: RecipientEstimate;
  optional: readonly OptionalChannel[];
  onToggle: (channel: OptionalChannel) => void;
  /** The warning is no longer waiting for approval, so the choice can no longer change. */
  locked: boolean;
}) {
  const t = useT();
  return (
    <section aria-labelledby="audience-heading" className="space-y-3">
      <h2 id="audience-heading" className="text-[15px] font-bold text-navy-900">
        {t('warnings.review.audience')}
      </h2>
      <p>{t('warnings.review.audienceTotal', { count: recipients.total })}</p>
      <ul className="space-y-1 text-sm">
        {ALWAYS_ON.map((channel) => (
          <li key={channel} className="flex justify-between gap-4 border-b border-line py-1">
            <span>{t(`warnings.review.channel.${channel}`)}</span>
            <span className="font-semibold">
              {t('warnings.review.channelCount', { count: recipients.byChannel[channel] })}
            </span>
          </li>
        ))}
      </ul>
      <fieldset disabled={locked} className="space-y-1">
        <legend className="text-sm font-semibold text-navy-900">
          {t('warnings.review.optional')}
        </legend>
        {OPTIONAL_CHANNELS.map((channel) => (
          <CheckboxField
            key={channel}
            checked={optional.includes(channel)}
            onChange={() => onToggle(channel)}
            label={`${t(`warnings.review.channel.${channel}`)} · ${t(
              'warnings.review.channelCount',
              {
                count: recipients.byChannel[channel],
              },
            )}`}
          />
        ))}
      </fieldset>
      {recipients.unreachable > 0 ? (
        <p className="text-sm text-warning-600">
          {t('warnings.review.unreachable', { count: recipients.unreachable })}
        </p>
      ) : null}
    </section>
  );
}
