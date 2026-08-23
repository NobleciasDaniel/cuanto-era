const SYMBOL_TO_CURRENCY = Object.freeze({
  "$": "USD",
  "US$": "USD",
  "CA$": "CAD",
  "AU$": "AUD",
  "MX$": "MXN",
  "MXN$": "MXN",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "R$": "BRL",
  "ARS$": "ARS",
  "COP$": "COP",
  "CLP$": "CLP"
});

const DOMAIN_CURRENCIES = Object.freeze({
  "amazon.com": "USD",
  "amazon.com.mx": "MXN",
  "amazon.ca": "CAD",
  "amazon.com.br": "BRL",
  "amazon.co.uk": "GBP",
  "amazon.co.jp": "JPY",
  "amazon.in": "INR",
  "amazon.com.au": "AUD",
  "amazon.de": "EUR",
  "amazon.es": "EUR",
  "amazon.fr": "EUR",
  "amazon.it": "EUR",
  "amazon.nl": "EUR",
  "amazon.com.be": "EUR",
  "mercadolibre.com.mx": "MXN",
  "mercadolibre.com.ar": "ARS",
  "mercadolibre.com.co": "COP",
  "mercadolibre.cl": "CLP",
  "mercadolibre.com.pe": "PEN",
  "mercadolivre.com.br": "BRL"
});

const DOMAIN_SUFFIX_CURRENCIES = Object.freeze([
  [".com.mx", "MXN"], [".mx", "MXN"],
  [".com.ar", "ARS"], [".ar", "ARS"],
  [".com.co", "COP"], [".co", "COP"],
  [".cl", "CLP"], [".com.pe", "PEN"], [".pe", "PEN"],
  [".com.br", "BRL"], [".br", "BRL"],
  [".ca", "CAD"], [".com.au", "AUD"], [".au", "AUD"],
  [".co.uk", "GBP"], [".uk", "GBP"],
  [".co.jp", "JPY"], [".jp", "JPY"], [".in", "INR"],
  [".de", "EUR"], [".es", "EUR"], [".fr", "EUR"], [".it", "EUR"],
  [".nl", "EUR"], [".be", "EUR"], [".at", "EUR"], [".ie", "EUR"],
  [".pt", "EUR"], [".fi", "EUR"], [".gr", "EUR"]
]);

const CURRENCY_CODES = Object.freeze([
  "MXN", "USD", "CAD", "AUD", "EUR", "GBP", "JPY", "INR", "BRL",
  "ARS", "COP", "CLP", "PEN"
]);

export function currencyFromDomain(domain = "") {
  const normalizedDomain = String(domain).replace(/^www\./, "").toLowerCase();
  const match = Object.entries(DOMAIN_CURRENCIES)
    .sort(([left], [right]) => right.length - left.length)
    .find(([knownDomain]) =>
      normalizedDomain === knownDomain || normalizedDomain.endsWith(`.${knownDomain}`)
    );
  if (match) return match[1];
  return DOMAIN_SUFFIX_CURRENCIES.find(([suffix]) => normalizedDomain.endsWith(suffix))?.[1] ?? "";
}

export function explicitCurrencyFromText(text) {
  const raw = String(text ?? "").normalize("NFKC").toUpperCase();
  const currencyPattern = CURRENCY_CODES.join("|");
  const explicitCode = raw.match(new RegExp(`(?:^|[^A-Z])(${currencyPattern})(?=$|[^A-Z])`));
  if (explicitCode) return explicitCode[1];

  const unambiguousSymbols = Object.entries(SYMBOL_TO_CURRENCY)
    .filter(([symbol]) => symbol !== "$")
    .sort(([left], [right]) => right.length - left.length);
  for (const [symbol, currency] of unambiguousSymbols) {
    if (raw.includes(symbol)) return currency;
  }
  return "";
}

export function normalizeCurrency(value, domain = "") {
  const raw = String(value ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;

  const compact = raw.replace(/\s+/g, "");
  if (SYMBOL_TO_CURRENCY[compact]) return SYMBOL_TO_CURRENCY[compact];
  if (raw.includes("MXN") || raw.includes("MX$")) return "MXN";
  if (raw.includes("USD") || raw.includes("US$")) return "USD";

  return currencyFromDomain(domain) || "USD";
}

export function inferCurrencyFromText(text, domain = "") {
  return explicitCurrencyFromText(text) || currencyFromDomain(domain) || "USD";
}

export function resolveCurrency({ currency, priceText, domain } = {}) {
  return explicitCurrencyFromText(priceText)
    || currencyFromDomain(domain)
    || normalizeCurrency(currency, domain);
}

export function parsePrice(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  let raw = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[^\d.,-]/g, "")
    .trim();

  if (!raw || raw === "-") return null;

  const negative = raw.startsWith("-");
  raw = raw.replace(/-/g, "");
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let normalized = raw;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const groupingSeparator = decimalSeparator === "." ? "," : ".";
    normalized = raw.split(groupingSeparator).join("");
    normalized = normalized.replace(decimalSeparator, ".");
  } else {
    const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
    if (separator) {
      const parts = raw.split(separator);
      const finalGroup = parts.at(-1) ?? "";
      const looksDecimal = finalGroup.length > 0 && finalGroup.length <= 2;
      if (looksDecimal) {
        normalized = `${parts.slice(0, -1).join("")}.${finalGroup}`;
      } else {
        normalized = parts.join("");
      }
    }
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function formatMoney(value, currency = "USD", locale = "es-MX") {
  if (!Number.isFinite(value)) return "Precio no disponible";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
