import { useState, type FormEvent } from 'react';
import { LANGUAGES, SEVERITIES, type Language, type Severity } from '@contracts/enums';
import { HTML_LANG, useT, type Translate } from '@/shared/i18n/I18nProvider';
import { translateCode, translateError } from '@/shared/i18n/translateError';
import { useOfflineWrite } from '@/shared/offline/useOfflineWrite';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/shared/ui/Field';
import {
  changesFrom,
  initialValues,
  validateEdit,
  type EditErrors,
  type EditValues,
} from './editForm';
import { SMS_MAX_LENGTH, smsLength } from './format';
import type { WarningDto } from './types';

const errorText = (
  t: Translate,
  code: string | undefined,
  language?: Language,
): string | undefined =>
  code === undefined
    ? undefined
    : translateCode(t, code, language ? { language: t(`lang.${language}`) } : {});

interface FieldsProps {
  values: EditValues;
  errors: EditErrors;
  onChange: (values: EditValues) => void;
}

function MessageFields({ values, errors, onChange }: FieldsProps) {
  const t = useT();
  return (
    <>
      {LANGUAGES.map((language) => (
        <TextAreaField
          key={language}
          lang={HTML_LANG[language]}
          label={t('warnings.edit.text', { language: t(`lang.${language}`) })}
          hint={t('warnings.review.smsCount', {
            count: smsLength(values.messages[language]),
            max: SMS_MAX_LENGTH,
          })}
          error={errorText(t, errors[`messages.${language}`], language)}
          rows={3}
          value={values.messages[language]}
          onChange={(event) =>
            onChange({
              ...values,
              messages: { ...values.messages, [language]: event.target.value },
            })
          }
        />
      ))}
    </>
  );
}

function ValidityFields({ values, errors, onChange }: FieldsProps) {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <SelectField
        label={t('warnings.edit.severity')}
        value={values.severity}
        onChange={(event) => onChange({ ...values, severity: event.target.value as Severity })}
      >
        {SEVERITIES.map((severity) => (
          <option key={severity} value={severity}>
            {t(`severity.${severity}`)}
          </option>
        ))}
      </SelectField>
      <TextField
        type="datetime-local"
        label={t('warnings.edit.validFrom')}
        error={errorText(t, errors.validFrom)}
        value={values.validFrom}
        onChange={(event) => onChange({ ...values, validFrom: event.target.value })}
      />
      <TextField
        type="datetime-local"
        label={t('warnings.edit.validTo')}
        error={errorText(t, errors.validTo)}
        value={values.validTo}
        onChange={(event) => onChange({ ...values, validTo: event.target.value })}
      />
    </div>
  );
}

/**
 * UC-1 A2 (screen 3): change the text, severity or validity of a warning that is still waiting. Mistakes
 * are marked next to the field (E1) and only what changed is sent. Offline, the change is queued (BR6);
 * the version the officer was looking at travels with it, so a clash is caught when it is replayed.
 */
export function EditWarningForm({
  warning,
  onCancel,
  onSaved,
}: {
  warning: WarningDto;
  onCancel: () => void;
  /** `queued`: saved on this device, to be sent when the connection returns. */
  onSaved: (queued: boolean) => void;
}) {
  const t = useT();
  const write = useOfflineWrite();
  const [values, setValues] = useState(() => initialValues(warning));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const errors = submitted ? validateEdit(values) : {};

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateEdit(values)).length > 0) return;
    const changes = changesFrom(warning, values);
    if (Object.keys(changes).length === 0) return onCancel();
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await write({
        module: 'warnings',
        method: 'PATCH',
        url: `/api/warnings/${warning.warningId}`,
        body: { expectedVersion: warning.version, ...changes },
      });
      onSaved(result.queued);
    } catch (error) {
      setFailure(error);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-labelledby="edit-heading"
      className="space-y-4 rounded-lg border border-line bg-card p-4"
    >
      <h2 id="edit-heading" className="text-lg font-bold text-navy-900">
        {t('warnings.edit.title')}
      </h2>
      {failure ? <Alert tone="danger">{translateError(t, failure)}</Alert> : null}
      <ValidityFields values={values} errors={errors} onChange={setValues} />
      <MessageFields values={values} errors={errors} onChange={setValues} />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={busy} loadingLabel={t('warnings.edit.saving')}>
          {t('warnings.edit.save')}
        </Button>
      </div>
    </form>
  );
}
