import { useEffect, useState } from 'react';
import { CHANNELS, type Channel } from '@contracts/enums';
import { useApi } from '@/shared/api/ApiProvider';
import { useT } from '@/shared/i18n/I18nProvider';
import { translateError } from '@/shared/i18n/translateError';
import { Alert } from '@/shared/ui/Alert';
import { SelectField } from '@/shared/ui/Field';
import { getGateways, setGatewayMode } from './api';
import type { GatewayMode, GatewayModes } from './types';

const MODES: readonly GatewayMode[] = ['OK', 'FAIL_SOME', 'DOWN'];

/** Demo controls exist while developing and in a build made for a demonstration; never in production. */
export function demoToolsEnabled(env: { DEV?: boolean; VITE_DEMO_TOOLS?: string }): boolean {
  return Boolean(env.DEV) || env.VITE_DEMO_TOOLS === 'true';
}

/**
 * Flip a simulated gateway to "some sends fail" or "down" to show A1, E2 and E3 live. The server mounts
 * these routes only outside production, and this panel is only shown where they exist.
 */
export function DemoGatewayPanel() {
  const t = useT();
  const api = useApi();
  const [modes, setModes] = useState<GatewayModes>();
  const [failure, setFailure] = useState<unknown>();

  useEffect(() => {
    getGateways(api).then(setModes, setFailure);
  }, [api]);

  async function change(channel: Channel, mode: GatewayMode): Promise<void> {
    try {
      setModes(await setGatewayMode(api, channel, mode));
      setFailure(undefined);
    } catch (error) {
      setFailure(error);
    }
  }

  return (
    <details className="rounded-lg border border-dashed border-line-strong p-4">
      <summary className="cursor-pointer font-semibold text-navy-900">
        {t('warnings.demo.title')}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-ink-soft">{t('warnings.demo.hint')}</p>
        {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
        {modes ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {CHANNELS.map((channel) => (
              <SelectField
                key={channel}
                label={t('warnings.demo.channel', {
                  channel: t(`warnings.review.channel.${channel}`),
                })}
                value={modes[channel]}
                onChange={(event) => void change(channel, event.target.value as GatewayMode)}
              >
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`warnings.demo.mode.${mode}`)}
                  </option>
                ))}
              </SelectField>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** The panel while developing or in a demonstration build; nothing at all in production. */
export function DemoTools() {
  return demoToolsEnabled(import.meta.env) ? <DemoGatewayPanel /> : null;
}
