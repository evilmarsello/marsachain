import { aboutAppSectionsAr, aboutMarsaSectionsAr } from "./about.ar";
import { aboutAppSectionsDe, aboutMarsaSectionsDe } from "./about.de";
import { aboutAppSectionsEn, aboutMarsaSectionsEn, type AboutSection } from "./about.en";
import { aboutAppSectionsEs, aboutMarsaSectionsEs } from "./about.es";
import { aboutAppSectionsFr, aboutMarsaSectionsFr } from "./about.fr";
import { aboutAppSectionsId, aboutMarsaSectionsId } from "./about.id";
import { aboutAppSectionsJa, aboutMarsaSectionsJa } from "./about.ja";
import { aboutAppSectionsPt, aboutMarsaSectionsPt } from "./about.pt";
import { aboutAppSectionsRu, aboutMarsaSectionsRu } from "./about.ru";
import { ar } from "./messages.ar";
import { de } from "./messages.de";
import { en, type Messages } from "./messages.en";
import { es } from "./messages.es";
import { fr } from "./messages.fr";
import { id } from "./messages.id";
import { ja } from "./messages.ja";
import { pt } from "./messages.pt";
import { ru } from "./messages.ru";
import { networkConfigSectionsAr } from "./networkConfig.ar";
import { networkConfigSectionsDe } from "./networkConfig.de";
import { networkConfigSectionsEn } from "./networkConfig.en";
import { networkConfigSectionsEs } from "./networkConfig.es";
import { networkConfigSectionsFr } from "./networkConfig.fr";
import { networkConfigSectionsId } from "./networkConfig.id";
import { networkConfigSectionsJa } from "./networkConfig.ja";
import { networkConfigSectionsPt } from "./networkConfig.pt";
import { networkConfigSectionsRu } from "./networkConfig.ru";
import { termsOfUseAr } from "./termsOfUse.ar";
import { termsOfUseDe } from "./termsOfUse.de";
import { termsOfUseEn } from "./termsOfUse.en";
import { termsOfUseEs } from "./termsOfUse.es";
import { termsOfUseFr } from "./termsOfUse.fr";
import { termsOfUseId } from "./termsOfUse.id";
import { termsOfUseJa } from "./termsOfUse.ja";
import { termsOfUsePt } from "./termsOfUse.pt";
import { termsOfUseRu } from "./termsOfUse.ru";
import {
  type Locale,
  LOCALES,
  LOCALE_LABELS,
  localeSelectOptionsHtml,
  pickLocale,
  isLocale,
} from "./localeMeta";

export type { Locale };
export { LOCALES, LOCALE_LABELS, localeSelectOptionsHtml, pickLocale, isLocale };

const LS_LOCALE = "marsa-tma-locale";

const catalog: Record<Locale, Messages> = { en, ru, es, ar, fr, pt, id, de, ja };

const aboutAppByLocale: Record<Locale, AboutSection[]> = {
  en: aboutAppSectionsEn,
  ru: aboutAppSectionsRu,
  es: aboutAppSectionsEs,
  ar: aboutAppSectionsAr,
  fr: aboutAppSectionsFr,
  pt: aboutAppSectionsPt,
  id: aboutAppSectionsId,
  de: aboutAppSectionsDe,
  ja: aboutAppSectionsJa,
};

const aboutMarsaByLocale: Record<Locale, AboutSection[]> = {
  en: aboutMarsaSectionsEn,
  ru: aboutMarsaSectionsRu,
  es: aboutMarsaSectionsEs,
  ar: aboutMarsaSectionsAr,
  fr: aboutMarsaSectionsFr,
  pt: aboutMarsaSectionsPt,
  id: aboutMarsaSectionsId,
  de: aboutMarsaSectionsDe,
  ja: aboutMarsaSectionsJa,
};

const networkConfigByLocale: Record<Locale, AboutSection[]> = {
  en: networkConfigSectionsEn,
  ru: networkConfigSectionsRu,
  es: networkConfigSectionsEs,
  ar: networkConfigSectionsAr,
  fr: networkConfigSectionsFr,
  pt: networkConfigSectionsPt,
  id: networkConfigSectionsId,
  de: networkConfigSectionsDe,
  ja: networkConfigSectionsJa,
};

const termsOfUseByLocale: Record<Locale, string> = {
  en: termsOfUseEn,
  ru: termsOfUseRu,
  es: termsOfUseEs,
  ar: termsOfUseAr,
  fr: termsOfUseFr,
  pt: termsOfUsePt,
  id: termsOfUseId,
  de: termsOfUseDe,
  ja: termsOfUseJa,
};

let currentLocale: Locale = "en";
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function t(locale?: Locale): Messages {
  return catalog[locale ?? currentLocale];
}

export function getAboutAppSections(locale?: Locale): AboutSection[] {
  return aboutAppByLocale[locale ?? currentLocale];
}

export function getAboutMarsaSections(locale?: Locale): AboutSection[] {
  return aboutMarsaByLocale[locale ?? currentLocale];
}

export function getNetworkConfigSections(locale?: Locale): AboutSection[] {
  return networkConfigByLocale[locale ?? currentLocale];
}

export function getTermsOfUseText(locale?: Locale): string {
  return termsOfUseByLocale[locale ?? currentLocale];
}

function applyDocumentLocale(loc: Locale): void {
  document.documentElement.lang = loc;
  document.documentElement.dir = loc === "ar" ? "rtl" : "ltr";
}

export function setLocale(next: Locale, persist = true): void {
  if (next === currentLocale) return;
  currentLocale = next;
  applyDocumentLocale(next);
  if (persist) {
    try {
      localStorage.setItem(LS_LOCALE, next);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((fn) => fn());
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resolve initial locale: saved → Vite override → Telegram → English. */
export function initLocale(): Locale {
  try {
    const saved = localStorage.getItem(LS_LOCALE);
    if (saved && isLocale(saved)) {
      currentLocale = saved;
      applyDocumentLocale(currentLocale);
      return currentLocale;
    }
  } catch {
    /* ignore */
  }
  const uiOverride = (import.meta.env.VITE_UI_LOCALE as string | undefined)?.trim().toLowerCase();
  if (uiOverride && isLocale(uiOverride)) {
    currentLocale = uiOverride;
    applyDocumentLocale(currentLocale);
    return currentLocale;
  }
  const tgCode = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  currentLocale = pickLocale(tgCode);
  applyDocumentLocale(currentLocale);
  return currentLocale;
}

export type { Messages };
