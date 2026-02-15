/**
 * i18n – Internationalisation support.
 *
 * Parses Accept-Language, resolves best locale, and provides
 * translated error messages via a compile-time-safe key system.
 *
 * Zero external dependencies.
 */

/** All translatable message keys. Add new keys here. */
export type MessageKey =
  | "auth.invalid_credentials"
  | "auth.email_taken"
  | "auth.token_expired"
  | "auth.token_invalid"
  | "auth.account_locked"
  | "auth.email_not_verified"
  | "auth.mfa_required"
  | "auth.mfa_invalid"
  | "auth.refresh_token_invalid"
  | "auth.password_too_weak"
  | "auth.password_recently_used"
  | "user.not_found"
  | "user.forbidden"
  | "validation.required"
  | "validation.invalid_email"
  | "validation.too_short"
  | "validation.too_long"
  | "rate_limit.exceeded"
  | "server.internal_error"
  | "server.service_unavailable"
  | "not_found"
  | "forbidden"
  | "unauthorized";

type MessageCatalog = Record<MessageKey, string>;

/** English (default) */
const en: MessageCatalog = {
  "auth.invalid_credentials": "Invalid email or password",
  "auth.email_taken": "An account with this email already exists",
  "auth.token_expired": "Authentication token has expired",
  "auth.token_invalid": "Authentication token is invalid",
  "auth.account_locked": "Account is temporarily locked due to too many failed attempts",
  "auth.email_not_verified": "Please verify your email address before logging in",
  "auth.mfa_required": "Multi-factor authentication is required",
  "auth.mfa_invalid": "Invalid MFA code",
  "auth.refresh_token_invalid": "Refresh token is invalid or has been revoked",
  "auth.password_too_weak": "Password does not meet the security requirements",
  "auth.password_recently_used": "This password was used recently. Please choose a different one",
  "user.not_found": "User not found",
  "user.forbidden": "You do not have permission to perform this action",
  "validation.required": "This field is required",
  "validation.invalid_email": "Please provide a valid email address",
  "validation.too_short": "Value is too short",
  "validation.too_long": "Value is too long",
  "rate_limit.exceeded": "Too many requests. Please try again later",
  "server.internal_error": "An internal server error occurred",
  "server.service_unavailable": "Service is temporarily unavailable",
  not_found: "The requested resource was not found",
  forbidden: "Access denied",
  unauthorized: "Authentication is required",
};

/** Spanish */
const es: MessageCatalog = {
  "auth.invalid_credentials": "Correo electrónico o contraseña no válidos",
  "auth.email_taken": "Ya existe una cuenta con este correo electrónico",
  "auth.token_expired": "El token de autenticación ha caducado",
  "auth.token_invalid": "El token de autenticación no es válido",
  "auth.account_locked": "La cuenta está bloqueada temporalmente por demasiados intentos fallidos",
  "auth.email_not_verified": "Por favor, verifique su correo electrónico antes de iniciar sesión",
  "auth.mfa_required": "Se requiere autenticación multifactor",
  "auth.mfa_invalid": "Código MFA no válido",
  "auth.refresh_token_invalid": "El token de actualización no es válido o ha sido revocado",
  "auth.password_too_weak": "La contraseña no cumple los requisitos de seguridad",
  "auth.password_recently_used": "Esta contraseña fue usada recientemente. Elija una diferente",
  "user.not_found": "Usuario no encontrado",
  "user.forbidden": "No tiene permiso para realizar esta acción",
  "validation.required": "Este campo es obligatorio",
  "validation.invalid_email": "Proporcione una dirección de correo electrónico válida",
  "validation.too_short": "El valor es demasiado corto",
  "validation.too_long": "El valor es demasiado largo",
  "rate_limit.exceeded": "Demasiadas solicitudes. Inténtelo de nuevo más tarde",
  "server.internal_error": "Se produjo un error interno del servidor",
  "server.service_unavailable": "El servicio no está disponible temporalmente",
  not_found: "El recurso solicitado no fue encontrado",
  forbidden: "Acceso denegado",
  unauthorized: "Se requiere autenticación",
};

/** French */
const fr: MessageCatalog = {
  "auth.invalid_credentials": "Adresse e-mail ou mot de passe incorrect",
  "auth.email_taken": "Un compte avec cette adresse e-mail existe déjà",
  "auth.token_expired": "Le jeton d'authentification a expiré",
  "auth.token_invalid": "Le jeton d'authentification est invalide",
  "auth.account_locked": "Le compte est temporairement verrouillé en raison de trop de tentatives",
  "auth.email_not_verified": "Veuillez vérifier votre adresse e-mail avant de vous connecter",
  "auth.mfa_required": "L'authentification multifacteur est requise",
  "auth.mfa_invalid": "Code MFA invalide",
  "auth.refresh_token_invalid": "Le jeton de rafraîchissement est invalide ou a été révoqué",
  "auth.password_too_weak": "Le mot de passe ne répond pas aux exigences de sécurité",
  "auth.password_recently_used":
    "Ce mot de passe a été utilisé récemment. Veuillez en choisir un autre",
  "user.not_found": "Utilisateur introuvable",
  "user.forbidden": "Vous n'avez pas la permission d'effectuer cette action",
  "validation.required": "Ce champ est obligatoire",
  "validation.invalid_email": "Veuillez fournir une adresse e-mail valide",
  "validation.too_short": "La valeur est trop courte",
  "validation.too_long": "La valeur est trop longue",
  "rate_limit.exceeded": "Trop de requêtes. Veuillez réessayer plus tard",
  "server.internal_error": "Une erreur interne du serveur s'est produite",
  "server.service_unavailable": "Le service est temporairement indisponible",
  not_found: "La ressource demandée est introuvable",
  forbidden: "Accès refusé",
  unauthorized: "Une authentification est requise",
};

/** German */
const de: MessageCatalog = {
  "auth.invalid_credentials": "Ungültige E-Mail-Adresse oder Passwort",
  "auth.email_taken": "Ein Konto mit dieser E-Mail-Adresse existiert bereits",
  "auth.token_expired": "Das Authentifizierungstoken ist abgelaufen",
  "auth.token_invalid": "Das Authentifizierungstoken ist ungültig",
  "auth.account_locked": "Das Konto ist aufgrund zu vieler Fehlversuche vorübergehend gesperrt",
  "auth.email_not_verified": "Bitte bestätigen Sie Ihre E-Mail-Adresse, bevor Sie sich anmelden",
  "auth.mfa_required": "Multi-Faktor-Authentifizierung ist erforderlich",
  "auth.mfa_invalid": "Ungültiger MFA-Code",
  "auth.refresh_token_invalid": "Das Aktualisierungstoken ist ungültig oder wurde widerrufen",
  "auth.password_too_weak": "Das Passwort erfüllt nicht die Sicherheitsanforderungen",
  "auth.password_recently_used":
    "Dieses Passwort wurde kürzlich verwendet. Bitte wählen Sie ein anderes",
  "user.not_found": "Benutzer nicht gefunden",
  "user.forbidden": "Sie haben keine Berechtigung, diese Aktion durchzuführen",
  "validation.required": "Dieses Feld ist erforderlich",
  "validation.invalid_email": "Bitte geben Sie eine gültige E-Mail-Adresse an",
  "validation.too_short": "Der Wert ist zu kurz",
  "validation.too_long": "Der Wert ist zu lang",
  "rate_limit.exceeded": "Zu viele Anfragen. Bitte versuchen Sie es später erneut",
  "server.internal_error": "Ein interner Serverfehler ist aufgetreten",
  "server.service_unavailable": "Der Dienst ist vorübergehend nicht verfügbar",
  not_found: "Die angeforderte Ressource wurde nicht gefunden",
  forbidden: "Zugriff verweigert",
  unauthorized: "Authentifizierung ist erforderlich",
};

/** Japanese */
const ja: MessageCatalog = {
  "auth.invalid_credentials": "メールアドレスまたはパスワードが無効です",
  "auth.email_taken": "このメールアドレスのアカウントは既に存在します",
  "auth.token_expired": "認証トークンの有効期限が切れています",
  "auth.token_invalid": "認証トークンが無効です",
  "auth.account_locked": "ログイン失敗回数が多すぎるため、アカウントが一時的にロックされています",
  "auth.email_not_verified": "ログインする前にメールアドレスを確認してください",
  "auth.mfa_required": "多要素認証が必要です",
  "auth.mfa_invalid": "無効なMFAコードです",
  "auth.refresh_token_invalid": "リフレッシュトークンが無効、または取り消されています",
  "auth.password_too_weak": "パスワードがセキュリティ要件を満たしていません",
  "auth.password_recently_used":
    "このパスワードは最近使用されました。別のパスワードを選択してください",
  "user.not_found": "ユーザーが見つかりません",
  "user.forbidden": "この操作を行う権限がありません",
  "validation.required": "この項目は必須です",
  "validation.invalid_email": "有効なメールアドレスを入力してください",
  "validation.too_short": "値が短すぎます",
  "validation.too_long": "値が長すぎます",
  "rate_limit.exceeded": "リクエストが多すぎます。しばらくしてからもう一度お試しください",
  "server.internal_error": "内部サーバーエラーが発生しました",
  "server.service_unavailable": "サービスは一時的に利用できません",
  not_found: "リクエストされたリソースが見つかりません",
  forbidden: "アクセスが拒否されました",
  unauthorized: "認証が必要です",
};

/** All supported locale catalogs */
const catalogs: Record<string, MessageCatalog> = {
  en,
  es,
  fr,
  de,
  ja,
};

/**
 * Parse the Accept-Language header and return an ordered list of locale tags.
 * Example: "fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7" → ["fr", "en", "de"]
 */
export const parseAcceptLanguage = (header: string | null): readonly string[] => {
  if (!header) return [];

  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      let q = 1;
      for (const p of params) {
        const match = p.trim().match(/^q=(\d+(?:\.\d+)?)$/);
        if (match?.[1] !== undefined) {
          q = Number.parseFloat(match[1]);
        }
      }
      // Normalize: "fr-CH" → "fr"
      const lang = (tag ?? "").trim().split("-")[0]?.toLowerCase() ?? "";
      return { lang, q };
    })
    .filter((e) => e.lang.length > 0 && e.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((e) => e.lang);
};

/**
 * Resolve the best locale from Accept-Language given supported locales.
 */
export const resolveLocale = (
  acceptLanguages: readonly string[],
  supportedLocales: readonly string[],
  defaultLocale: string,
): string => {
  for (const lang of acceptLanguages) {
    if (supportedLocales.includes(lang)) return lang;
  }
  return defaultLocale;
};

/**
 * Get a translated message by key for a given locale.
 * Falls back to English if the locale or key is missing.
 */
export const t = (locale: string, key: MessageKey): string => {
  const catalog = catalogs[locale] ?? catalogs["en"];
  // biome-ignore lint/style/noNonNullAssertion: en catalog is always complete
  return catalog![key] ?? en[key];
};

/**
 * Create an i18n context for a request.
 * Resolves locale from Accept-Language and provides a bound `t` function.
 */
export const createI18nContext = (
  req: Request,
  supportedLocales: readonly string[],
  defaultLocale: string,
) => {
  const acceptLanguages = parseAcceptLanguage(req.headers.get("Accept-Language"));
  const locale = resolveLocale(acceptLanguages, supportedLocales, defaultLocale);

  return {
    locale,
    t: (key: MessageKey) => t(locale, key),
  };
};

export type I18nContext = ReturnType<typeof createI18nContext>;
