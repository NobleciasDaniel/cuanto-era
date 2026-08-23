import { createProductIdentity, normalizeText, normalizeVariant } from "./identity.js";
import { normalizeLocalProductImage } from "./image.js";
import { parsePrice, resolveCurrency } from "./price.js";
import { domainFromUrl, normalizeProductUrl, storeFromDomain } from "./url.js";

function cleanFact(value, maximumLength) {
  const normalized = normalizeText(value);
  return normalized.length <= maximumLength ? normalized : "";
}

function cleanAvailability(value) {
  const normalized = cleanFact(value, 100);
  const lowered = normalized.toLowerCase();
  if (!normalized) return "";
  if (/out of stock|agotad[oa]|no disponible/.test(lowered)) return "Agotado";
  if (/^in stock$|^disponible$|^en stock$/.test(lowered)) return "Disponible";
  if (/^pre[- ]?order$|^preventa$/.test(lowered)) return "Preventa";
  return normalized;
}

export function prepareProduct(rawProduct) {
  if (!rawProduct || typeof rawProduct !== "object") {
    throw new TypeError("El producto extraído no es válido.");
  }

  const canonicalUrl = normalizeProductUrl(rawProduct.canonicalUrl || rawProduct.url);
  const domain = rawProduct.domain || domainFromUrl(canonicalUrl);
  const price = parsePrice(rawProduct.price);
  if (!canonicalUrl || !normalizeText(rawProduct.title) || price === null) {
    throw new TypeError("Faltan URL, título o precio para guardar el producto.");
  }

  const currency = resolveCurrency({
    currency: rawProduct.currency,
    priceText: rawProduct.priceText,
    domain
  });
  const product = {
    store: rawProduct.store || storeFromDomain(domain),
    domain,
    productId: normalizeText(rawProduct.productId),
    canonicalUrl,
    title: normalizeText(rawProduct.title),
    image: normalizeLocalProductImage(rawProduct.image),
    variant: normalizeVariant(rawProduct.variant),
    price,
    originalPrice: parsePrice(rawProduct.originalPrice),
    currency,
    seller: cleanFact(rawProduct.seller, 80),
    availability: cleanAvailability(rawProduct.availability),
    shipping: cleanFact(rawProduct.shipping, 160),
    adapter: normalizeText(rawProduct.adapter || rawProduct.store || "generic")
  };
  return { ...product, id: createProductIdentity(product) };
}
