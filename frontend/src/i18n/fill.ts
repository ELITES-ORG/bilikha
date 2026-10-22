/** Replaces each `{name}` with its value. The catalogue keeps every sentence whole. */
export function fill(text: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce((out, [name, value]) => out.replace(`{${name}}`, value), text);
}
