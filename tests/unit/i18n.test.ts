/**
 * Unit tests for i18n — Accept-Language parsing, locale resolution, translations.
 */

import { describe, expect, test } from "bun:test";
import {
  createI18nContext,
  parseAcceptLanguage,
  resolveLocale,
  t,
} from "../../src/presentation/i18n/index.js";

describe("i18n: parseAcceptLanguage", () => {
  test("parses simple language tag", () => {
    const result = parseAcceptLanguage("en");
    expect(result).toEqual(["en"]);
  });

  test("parses multiple tags with quality values", () => {
    const result = parseAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7");
    expect(result).toEqual(["fr", "fr", "en", "de"]);
  });

  test("sorts by quality descending", () => {
    const result = parseAcceptLanguage("de;q=0.5, en;q=0.9, fr;q=0.7");
    expect(result).toEqual(["en", "fr", "de"]);
  });

  test("filters out q=0 entries", () => {
    const result = parseAcceptLanguage("en, de;q=0");
    expect(result).toEqual(["en"]);
  });

  test("handles null header", () => {
    const result = parseAcceptLanguage(null);
    expect(result).toEqual([]);
  });

  test("handles empty string", () => {
    const result = parseAcceptLanguage("");
    expect(result).toEqual([]);
  });

  test("normalizes region subtags (fr-FR → fr)", () => {
    const result = parseAcceptLanguage("fr-FR, en-US;q=0.8");
    expect(result).toEqual(["fr", "en"]);
  });
});

describe("i18n: resolveLocale", () => {
  const supported = ["en", "es", "fr", "de", "ja"];

  test("returns first matching locale", () => {
    const result = resolveLocale(["fr", "en"], supported, "en");
    expect(result).toBe("fr");
  });

  test("falls back to default when no match", () => {
    const result = resolveLocale(["zh", "ko"], supported, "en");
    expect(result).toBe("en");
  });

  test("returns default for empty preferences", () => {
    const result = resolveLocale([], supported, "en");
    expect(result).toBe("en");
  });
});

describe("i18n: t (translate)", () => {
  test("returns English message by default", () => {
    expect(t("en", "auth.invalid_credentials")).toBe("Invalid email or password");
  });

  test("returns Spanish translation", () => {
    expect(t("es", "auth.invalid_credentials")).toBe("Correo electrónico o contraseña no válidos");
  });

  test("returns French translation", () => {
    expect(t("fr", "auth.email_taken")).toBe("Un compte avec cette adresse e-mail existe déjà");
  });

  test("returns German translation", () => {
    expect(t("de", "user.not_found")).toBe("Benutzer nicht gefunden");
  });

  test("returns Japanese translation", () => {
    expect(t("ja", "rate_limit.exceeded")).toBe(
      "リクエストが多すぎます。しばらくしてからもう一度お試しください",
    );
  });

  test("falls back to English for unsupported locale", () => {
    expect(t("zh", "not_found")).toBe("The requested resource was not found");
  });
});

describe("i18n: createI18nContext", () => {
  const supported = ["en", "es", "fr", "de", "ja"];

  test("resolves locale from Accept-Language header", () => {
    const req = new Request("http://localhost/test", {
      headers: { "Accept-Language": "es" },
    });
    const ctx = createI18nContext(req, supported, "en");
    expect(ctx.locale).toBe("es");
    expect(ctx.t("not_found")).toBe("El recurso solicitado no fue encontrado");
  });

  test("uses default locale when no Accept-Language", () => {
    const req = new Request("http://localhost/test");
    const ctx = createI18nContext(req, supported, "en");
    expect(ctx.locale).toBe("en");
  });

  test("handles complex Accept-Language with quality values", () => {
    const req = new Request("http://localhost/test", {
      headers: { "Accept-Language": "zh;q=0.9, ja;q=0.8, en;q=0.5" },
    });
    const ctx = createI18nContext(req, supported, "en");
    expect(ctx.locale).toBe("ja");
  });
});
