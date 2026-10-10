import type { Language } from '@/shared/contracts/enums';
import { en, type MessageKey } from './messages.en';
import { si } from './messages.si';
import { ta } from './messages.ta';

export type { MessageKey };
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

const CATALOGS: Record<Language, Record<MessageKey, string>> = { EN: en, SI: si, TA: ta };

/** `{name}` in a text is replaced by `params.name`; an unknown placeholder is left as it is. */
function fill(text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function translate(language: Language, key: MessageKey, params?: Params): string {
  const text = CATALOGS[language][key];
  return params ? fill(text, params) : text;
}

/** A `t` function fixed to one language: what a notification uses, which is written in the alert's language. */
export const translatorFor =
  (language: Language): Translate =>
  (key, params) =>
    translate(language, key, params);

/** Whether `key` names a text, so a code the server sends can be looked up safely. */
export const isMessageKey = (key: string): key is MessageKey =>
  Object.prototype.hasOwnProperty.call(en, key);
