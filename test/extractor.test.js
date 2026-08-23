import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { parseHTML } from "linkedom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extractorSource = readFileSync(join(root, "src/content/extract-product.js"), "utf8");

function extract(fixture, url) {
  const html = readFileSync(join(root, "test/fixtures", fixture), "utf8");
  const { document } = parseHTML(html);
  const context = vm.createContext({
    document,
    location: { href: url },
    URL,
    Date,
    console,
    CSS: { escape: (value) => String(value).replace(/["\\]/g, "\\$&") }
  });
  return new vm.Script(extractorSource, { filename: "extract-product.js" }).runInContext(context);
}

test("extrae Amazon y conserva la variante", () => {
  const result = extract("amazon.html", "https://www.amazon.com.mx/dp/B012345678?ref_=abc");
  assert.equal(result.ok, true);
  assert.equal(result.product.store, "amazon");
  assert.equal(result.product.productId, "B012345678");
  assert.equal(result.product.price, 1299);
  assert.equal(result.product.originalPrice, 1599);
  assert.equal(result.product.currency, "MXN");
  assert.equal(result.product.variant.Color, "Negro");
  assert.equal(result.product.canonicalUrl, "https://amazon.com.mx/dp/B012345678");
});

test("extrae Mercado Libre", () => {
  const result = extract(
    "mercadolibre.html",
    "https://articulo.mercadolibre.com.mx/MLM-123456789-consola?utm_campaign=sale"
  );
  assert.equal(result.ok, true);
  assert.equal(result.product.store, "mercado_libre");
  assert.equal(result.product.productId, "MLM123456789");
  assert.equal(result.product.price, 8499);
  assert.equal(result.product.currency, "MXN");
  assert.equal(result.product.seller, "Tienda oficial");
});

test("prioriza JSON-LD en una tienda genérica", () => {
  const result = extract("generic.html", "https://shop.example/products/cafetera?color=rojo&utm_source=mail");
  assert.equal(result.ok, true);
  assert.equal(result.product.store, "generic");
  assert.equal(result.product.title, "Cafetera automática");
  assert.equal(result.product.productId, "CAF-42");
  assert.equal(result.product.price, 2345.5);
  assert.equal(result.product.availability, "Disponible");
  assert.equal(result.product.seller, "Tienda Demo");
  assert.equal(result.product.canonicalUrl, "https://shop.example/products/cafetera?color=rojo");
});
