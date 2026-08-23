import test from "node:test";
import assert from "node:assert/strict";

import { comparePrices, snapshotsAreEquivalent, summarizeHistory } from "../src/shared/compare.js";
import { createProductIdentity, normalizeVariant, variantKey } from "../src/shared/identity.js";
import { formatMoney, inferCurrencyFromText, parsePrice, resolveCurrency } from "../src/shared/price.js";
import { prepareProduct } from "../src/shared/product.js";
import { normalizeProductUrl, storeFromDomain } from "../src/shared/url.js";

test("normaliza precios latinoamericanos y anglosajones", () => {
  assert.equal(parsePrice("MX$ 1,299.00"), 1299);
  assert.equal(parsePrice("$ 19.990"), 19990);
  assert.equal(parsePrice("1.234,56 €"), 1234.56);
  assert.equal(parsePrice("USD 1,234.56"), 1234.56);
  assert.equal(parsePrice("1299,5"), 1299.5);
  assert.equal(parsePrice("sin precio"), null);
});

test("infiere moneda explícita antes que el símbolo ambiguo", () => {
  assert.equal(inferCurrencyFromText("MX$ 1,299"), "MXN");
  assert.equal(inferCurrencyFromText("MXN3,722.25", "amazon.com"), "MXN");
  assert.equal(inferCurrencyFromText("USD99.00", "amazon.com.mx"), "USD");
  assert.equal(inferCurrencyFromText("US$ 99"), "USD");
  assert.equal(inferCurrencyFromText("1.299 MXN"), "MXN");
  assert.equal(inferCurrencyFromText("$ 1.299", "mercadolibre.com.ar"), "ARS");
  assert.equal(inferCurrencyFromText("$ 8.499", "articulo.mercadolibre.com.mx"), "MXN");
  assert.equal(inferCurrencyFromText("$ 22,999", "homedepot.com.mx"), "MXN");
  assert.equal(resolveCurrency({ currency: "USD", priceText: "MXN3,722.25", domain: "amazon.com" }), "MXN");
  assert.match(formatMoney(3722.25, "MXN"), /MXN/);
});

test("prepara el precio real de Amazon aunque su dominio principal sea estadounidense", () => {
  const product = prepareProduct({
    canonicalUrl: "https://amazon.com/dp/B0GZJBNVFY",
    domain: "amazon.com",
    title: "Chromebook",
    price: 3722.25,
    priceText: "MXN3,722.25",
    currency: "USD"
  });
  assert.equal(product.currency, "MXN");
});

test("solo admite miniaturas locales y rechaza imágenes remotas", () => {
  const base = {
    canonicalUrl: "https://amazon.com.mx/dp/B012345678",
    title: "Producto",
    price: 100,
    currency: "MXN"
  };
  const local = prepareProduct({ ...base, image: "data:image/webp;base64,QUJDRA==" });
  const remote = prepareProduct({ ...base, image: "https://images.example/product.jpg" });
  assert.equal(local.image, "data:image/webp;base64,QUJDRA==");
  assert.equal(remote.image, "");
});

test("descarta detalles y variantes que en realidad son bloques completos de la página", () => {
  const product = prepareProduct({
    canonicalUrl: "https://m.shein.com.mx/product-p-42.html",
    title: "Zapatos Mary Jane",
    price: 334.8,
    priceText: "MXN334.80",
    seller: "SHEIN",
    availability: "in stock",
    shipping: `Página principal ${"reseñas de clientes ".repeat(30)}`,
    variant: {
      Color: "Verde hoja",
      offlinestate: "Selecciona una provincia",
      Cantidad: "1"
    }
  });
  assert.equal(product.seller, "SHEIN");
  assert.equal(product.availability, "Disponible");
  assert.equal(product.shipping, "");
  assert.deepEqual(product.variant, { color: "Verde hoja" });
});

test("elimina seguimiento sin destruir parámetros de variante", () => {
  const normalized = normalizeProductUrl(
    "https://Tienda.example/producto?utm_source=mail&color=azul&gclid=123&size=m#opiniones"
  );
  assert.equal(normalized, "https://tienda.example/producto?color=azul&size=m");
  assert.equal(normalizeProductUrl("javascript:alert(1)"), "");
});

test("identifica tiendas conocidas por dominio", () => {
  assert.equal(storeFromDomain("www.amazon.com.mx"), "amazon");
  assert.equal(storeFromDomain("articulo.mercadolibre.com.mx"), "mercado_libre");
  assert.equal(storeFromDomain("tienda.example"), "generic");
});

test("una variante distinta produce otra identidad", () => {
  const base = {
    store: "amazon",
    productId: "B012345678",
    canonicalUrl: "https://amazon.com.mx/dp/B012345678"
  };
  const blue = createProductIdentity({ ...base, variant: { Color: "Azul", Capacidad: "128 GB" } });
  const blueReordered = createProductIdentity({ ...base, variant: { Capacidad: "128 GB", Color: "Azul" } });
  const black = createProductIdentity({ ...base, variant: { Color: "Negro", Capacidad: "128 GB" } });
  assert.equal(blue, blueReordered);
  assert.notEqual(blue, black);
  assert.equal(variantKey(normalizeVariant({ " Color ": " Azul  oscuro " })), "color:azul oscuro");
});

test("compara precios y resume el historial", () => {
  assert.deepEqual(comparePrices(900, 1000), { amount: -100, percentage: -10, direction: "down" });
  assert.deepEqual(comparePrices(1000, 1000), { amount: 0, percentage: 0, direction: "same" });
  const history = [
    { capturedAt: "2026-01-01T00:00:00.000Z", price: 1000, currency: "MXN" },
    { capturedAt: "2026-02-01T00:00:00.000Z", price: 900, currency: "MXN" },
    { capturedAt: "2026-03-01T00:00:00.000Z", price: 1100, currency: "MXN" }
  ];
  const summary = summarizeHistory(history);
  assert.equal(summary.minimum, 900);
  assert.equal(summary.maximum, 1100);
  assert.equal(summary.change.direction, "up");
  assert.equal(snapshotsAreEquivalent(history[0], { ...history[0], capturedAt: "otra-fecha" }), true);
});

test("no mezcla monedas al calcular mínimos y cambios", () => {
  const summary = summarizeHistory([
    { capturedAt: "2026-01-01T00:00:00.000Z", price: 99, currency: "USD" },
    { capturedAt: "2026-02-01T00:00:00.000Z", price: 1800, currency: "MXN" },
    { capturedAt: "2026-03-01T00:00:00.000Z", price: 1700, currency: "MXN" }
  ]);
  assert.equal(summary.minimum, 1700);
  assert.equal(summary.maximum, 1800);
  assert.equal(summary.change.direction, "down");
});
