import { forwardRef, useState } from 'react';
import type { TextInput, TextInputProps } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { TextField } from './TextField';

interface PasswordFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  hint?: string;
  error?: string;
}

/** A password box with a Show / Hide control, so a long passphrase can be checked on a small keyboard. */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const t = useT();
    const [visible, setVisible] = useState(false);
    return (
      <TextField
        ref={ref}
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        trailing={{
          label: visible ? t('common.hide') : t('common.show'),
          onPress: () => setVisible((shown) => !shown),
        }}
      />
    );
  },
);
