import { useI18n } from './i18n-context';
import type { MessageKey } from './catalogs/en';
import { fill } from './fill';

/**
 * One catalogue message as inline text, marked with the language it is
 * actually in — the chosen one, or English where the entry is still empty
 * (ADR 0055 §4). The same `<span lang>` the sign-in page writes out by hand,
 * for screens with more than a handful of strings. `values` fills its
 * `{name}` placeholders.
 */
export function Message({
  k,
  values,
}: {
  k: MessageKey;
  values?: Readonly<Record<string, string>>;
}) {
  const { text, lang } = useI18n().message(k);
  return <span lang={lang}>{values ? fill(text, values) : text}</span>;
}
