export type Locale = "en" | "ru" | "es" | "ar" | "fr" | "pt" | "id" | "de" | "ja";

/** Native language labels (same in every UI locale). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  es: "Español",
  ar: "العربية",
  fr: "Français",
  pt: "Português",
  id: "Indonesia",
  de: "Deutsch",
  ja: "日本語",
};

export const LOCALES: readonly Locale[] = [
  "en",
  "ru",
  "es",
  "ar",
  "fr",
  "pt",
  "id",
  "de",
  "ja",
];

export function localeSelectOptionsHtml(
  current: Locale,
  esc: (s: string) => string,
): string {
  return LOCALES.map(
    (code) =>
      `<option value="${code}"${current === code ? " selected" : ""}>${esc(LOCALE_LABELS[code])}</option>`,
  ).join("");
}

export function pickLocale(code: string | undefined): Locale {
  const c = code?.toLowerCase() ?? "";
  if (c.startsWith("ru")) return "ru";
  if (c.startsWith("es")) return "es";
  if (c.startsWith("ar")) return "ar";
  if (c.startsWith("fr")) return "fr";
  if (c.startsWith("pt")) return "pt";
  if (c.startsWith("id")) return "id";
  if (c.startsWith("de")) return "de";
  if (c.startsWith("ja")) return "ja";
  return "en";
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
