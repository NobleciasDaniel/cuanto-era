import { normalizeProductUrl } from "./url.js";

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVariant(variant) {
  if (!variant || typeof variant !== "object" || Array.isArray(variant)) return {};
  const noisyKey = /cantidad|quantity|provincia|province|pa[ií]s|country|ubicaci[oó]n|location|offline|store|tienda|search|buscar|sort|ordenar|idioma|language/i;
  return Object.fromEntries(
    Object.entries(variant)
      .map(([key, value]) => [normalizeText(key).toLowerCase(), normalizeText(value)])
      .filter(([key, value]) =>
        key && value && key.length <= 48 && value.length <= 96 && !noisyKey.test(key)
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function variantKey(variant) {
  return Object.entries(normalizeVariant(variant))
    .map(([key, value]) => `${key}:${value.toLowerCase()}`)
    .join("|");
}

export function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createProductIdentity(product) {
  const store = normalizeText(product.store || "generic").toLowerCase();
  const primaryKey = normalizeText(product.productId) || normalizeProductUrl(product.canonicalUrl || product.url);
  const variation = variantKey(product.variant);
  return `${store}-${stableHash(`${store}|${primaryKey}|${variation}`)}`;
}
