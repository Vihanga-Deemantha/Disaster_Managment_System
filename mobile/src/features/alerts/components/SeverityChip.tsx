import type { Severity } from '@/shared/contracts/enums';
import { useT } from '@/shared/i18n/I18nProvider';
import { severityLabel } from '@/shared/i18n/labels';
import { severityColors } from '@/shared/theme/tokens';
import { Chip } from '@/shared/ui/Chip';

/** Severity in words and colour: never colour alone. A critical warning is solid red, so it cannot pass for a high one. */
export function SeverityChip({ severity }: { severity: Severity }) {
  const t = useT();
  const { background, text } = severityColors[severity];
  return (
    <Chip
      testID={`severity-${severity}`}
      label={severityLabel(t, severity)}
      background={background}
      color={text}
    />
  );
}
