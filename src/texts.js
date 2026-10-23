// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene outputs.
// Four languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './matomo/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// What is missing in the configuration (src/config.js missingCredentials).
export const CONNECTION_TEXT = {
  invalidUrl: {
    en: 'Address not understood, e.g. https://stats.example.org',
    fr: 'Adresse incomprise, ex. https://stats.example.org',
    de: 'Adresse nicht verstanden, z. B. https://stats.example.org',
    es: 'Dirección no válida, p. ej. https://stats.example.org',
  },
  noUrl: {
    en: 'Fill in the address of your Matomo.',
    fr: "Indiquez l'adresse de votre Matomo.",
    de: 'Gib die Adresse deines Matomo an.',
    es: 'Indique la dirección de su Matomo.',
  },
  noToken: {
    en: 'Paste an authentication token (Personal → Security).',
    fr: "Collez un jeton d'authentification (Personnel → Sécurité).",
    de: 'Füge ein Authentifizierungs-Token ein (Persönlich → Sicherheit).',
    es: 'Pegue un token de autenticación (Personal → Seguridad).',
  },
};

// One short explanation per error kind (src/matomo/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Matomo does not answer',
    fr: 'Matomo ne répond pas',
    de: 'Matomo antwortet nicht',
    es: 'Matomo no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'token refused: create a new one in Personal → Security',
    fr: 'jeton refusé : créez-en un nouveau dans Personnel → Sécurité',
    de: 'Token abgelehnt: Erstelle ein neues unter Persönlich → Sicherheit',
    es: 'token rechazado: cree uno nuevo en Personal → Seguridad',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests: choose a longer refresh interval',
    fr: 'trop de requêtes : choisissez un intervalle plus long',
    de: 'zu viele Anfragen: Wähle ein längeres Intervall',
    es: 'demasiadas peticiones: elija un intervalo más largo',
  },
  [ERROR_KINDS.NOT_MATOMO]: {
    en: 'no Matomo at this address',
    fr: 'aucun Matomo à cette adresse',
    de: 'kein Matomo unter dieser Adresse',
    es: 'no hay ningún Matomo en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'this website no longer exists in Matomo',
    fr: "ce site n'existe plus dans Matomo",
    de: 'diese Website existiert in Matomo nicht mehr',
    es: 'este sitio ya no existe en Matomo',
  },
  [ERROR_KINDS.API]: {
    en: 'Matomo reports an error, see the logs',
    fr: 'Matomo signale une erreur, voir les logs',
    de: 'Matomo meldet einen Fehler, sieh in den Protokollen nach',
    es: 'Matomo indica un error, consulte los registros',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    websites: (n) => `${n} website(s)`,
    visitors: (n) => `${n} unique visitor(s) today`,
    active: (n) => `${n} right now`,
  },
  fr: {
    ok: 'Connecté',
    websites: (n) => `${n} site(s)`,
    visitors: (n) => `${n} visiteur(s) unique(s) aujourd'hui`,
    active: (n) => `${n} en ce moment`,
  },
  de: {
    ok: 'Verbunden',
    websites: (n) => `${n} Website(s)`,
    visitors: (n) => `${n} eindeutige Besucher heute`,
    active: (n) => `${n} gerade jetzt`,
  },
  es: {
    ok: 'Conectado',
    websites: (n) => `${n} sitio(s)`,
    visitors: (n) => `${n} visitante(s) único(s) hoy`,
    active: (n) => `${n} ahora mismo`,
  },
};

export const ACTION_TEXT = {
  unknownWebsite: {
    en: 'This device is not a Matomo website.',
    fr: "Cet appareil n'est pas un site Matomo.",
    de: 'Dieses Gerät ist keine Matomo-Website.',
    es: 'Este dispositivo no es un sitio de Matomo.',
  },
};

// The `sentence` output of "Read the figures of a website".
export const SENTENCE_TEXT = {
  en: {
    today: (name, visits, pageviews) =>
      `${name}: ${visits} visit(s) and ${pageviews} page view(s) today`,
    active: (n) => `${n} right now`,
    goals: (n) => `${n} goal conversion(s)`,
  },
  fr: {
    today: (name, visits, pageviews) =>
      `${name} : ${visits} visite(s) et ${pageviews} page(s) vue(s) aujourd'hui`,
    active: (n) => `${n} en ce moment`,
    goals: (n) => `${n} objectif(s) atteint(s)`,
  },
  de: {
    today: (name, visits, pageviews) =>
      `${name}: ${visits} Besuche und ${pageviews} Seitenaufrufe heute`,
    active: (n) => `${n} gerade jetzt`,
    goals: (n) => `${n} Zielkonversion(en)`,
  },
  es: {
    today: (name, visits, pageviews) =>
      `${name}: ${visits} visita(s) y ${pageviews} página(s) vista(s) hoy`,
    active: (n) => `${n} ahora mismo`,
    goals: (n) => `${n} conversión(es) de objetivos`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
