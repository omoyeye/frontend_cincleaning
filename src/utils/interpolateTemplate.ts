/** Replace {{var}} placeholders (keys: letters, numbers, underscore). */
export function interpolateTemplate(str: string, vars: Record<string, string>): string {
  if (!str) return '';
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : ''
  );
}
