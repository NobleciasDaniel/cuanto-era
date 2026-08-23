import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("el atributo hidden siempre oculta el indicador de carga", () => {
  const css = readFileSync(join(root, "src/popup/popup.css"), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/i);
});

test("la interfaz de producto evita los patrones visuales genéricos detectados", () => {
  const popupCss = readFileSync(join(root, "src/popup/popup.css"), "utf8");
  const dashboardCss = readFileSync(join(root, "src/dashboard/dashboard.css"), "utf8");
  const dashboardHtml = readFileSync(join(root, "src/dashboard/dashboard.html"), "utf8");
  assert.doesNotMatch(`${popupCss}\n${dashboardCss}`, /(?:linear|radial)-gradient\s*\(/i);
  assert.doesNotMatch(`${popupCss}\n${dashboardCss}`, /\bInter\b/);
  assert.doesNotMatch(dashboardHtml, /class="hero"/i);
  assert.match(dashboardHtml, /class="product-list"/i);
});

test("la interfaz declara privacidad y solo muestra miniaturas locales", () => {
  const popupHtml = readFileSync(join(root, "src/popup/popup.html"), "utf8");
  const dashboardHtml = readFileSync(join(root, "src/dashboard/dashboard.html"), "utf8");
  const popupJs = readFileSync(join(root, "src/popup/popup.js"), "utf8");
  const dashboardJs = readFileSync(join(root, "src/dashboard/dashboard.js"), "utf8");
  assert.match(popupHtml, /Nada se envía fuera del navegador/i);
  assert.match(popupHtml, /privacy\/privacy\.html/i);
  assert.doesNotMatch(`${popupHtml}\n${dashboardHtml}`, /<(?:img|iframe)[^>]+src=["']https?:/i);
  assert.match(popupJs, /isLocalProductImage\(product\.image\)/);
  assert.match(dashboardJs, /isLocalProductImage\(product\.image\)/);
  assert.doesNotMatch(`${popupJs}\n${dashboardJs}`, /\.src\s*=\s*["'`]https?:/i);
});
