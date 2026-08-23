import { TRACKING_PARAMETERS } from "./constants.js";

function isTrackingParameter(name) {
  const normalized = name.toLowerCase();
  return normalized.startsWith("utm_") || TRACKING_PARAMETERS.includes(normalized);
}

export function normalizeDomain(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

export function normalizeProductUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isTrackingParameter(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

export function domainFromUrl(value) {
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return "";
  }
}

export function storeFromDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (normalized === "amazon.com" || normalized.startsWith("amazon.")) return "amazon";
  if (normalized.includes("mercadolibre.") || normalized.includes("mercadolivre.")) {
    return "mercado_libre";
  }
  return "generic";
}
