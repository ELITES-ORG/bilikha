import { useI18n } from './i18n-context';
import type { MessageKey } from './catalogs/en';

/**
 * One catalogue message as inline text, marked with the language it is
 * actually in — the chosen one, or English where the entry is still empty
 * (ADR 0055 §4). The same `<span lang>` the sign-in page writes out by hand,
 * for screens with more than a handful of strings.
 */
export function Message({ k }: { k: MessageKey }) {
  const { text, lang } = useI18n().message(k);
  return <span lang={lang}>{text}</span>;
}
