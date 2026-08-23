import { comparePrices, summarizeHistory } from "../shared/compare.js";
import { STORE_LABELS } from "../shared/constants.js";
import { isLocalProductImage } from "../shared/image.js";
import { formatMoney } from "../shared/price.js";
import { prepareProduct } from "../shared/product.js";
import { StorageRepository } from "../shared/storage.js";

const repository = new StorageRepository();
const elements = Object.fromEntries(
  [
    "status", "product", "store", "product-title", "product-image", "variant",
    "current-price", "original-price", "comparison", "previous-price", "previous-date",
    "change-card", "change-value", "change-label", "history-stats", "minimum-price",
    "maximum-price", "history-count", "details", "save", "save-feedback", "open-dashboard"
  ].map((id) => [id, document.getElementById(id)])
);

let currentProduct = null;

function showError(title, message) {
  elements.status.classList.add("error");
  elements.status.querySelector("strong").textContent = title;
  elements.status.querySelector("p").textContent = message;
  elements.status.querySelector(".spinner").textContent = "!";
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatVariant(variant) {
  return Object.entries(variant ?? {}).map(([key, value]) => `${key}: ${value}`).join(" · ");
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("No se pudo preparar la miniatura.")), { once: true });
    image.src = source;
  });
}

async function captureProductThumbnail(tab, rect) {
  if (!rect || !tab?.windowId || !rect.viewportWidth || !rect.viewportHeight) return "";
  try {
    const screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 82 });
    const screenshot = await loadImage(screenshotUrl);
    const scaleX = screenshot.naturalWidth / rect.viewportWidth;
    const scaleY = screenshot.naturalHeight / rect.viewportHeight;
    const source = {
      x: Math.max(0, rect.left * scaleX),
      y: Math.max(0, rect.top * scaleY),
      width: Math.min(screenshot.naturalWidth - rect.left * scaleX, rect.width * scaleX),
      height: Math.min(screenshot.naturalHeight - rect.top * scaleY, rect.height * scaleY)
    };
    if (source.width < 24 || source.height < 24) return "";

    const size = 128;
    const padding = 8;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return "";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    const ratio = Math.min((size - padding * 2) / source.width, (size - padding * 2) / source.height);
    const width = source.width * ratio;
    const height = source.height * ratio;
    context.drawImage(
      screenshot,
      source.x,
      source.y,
      source.width,
      source.height,
      (size - width) / 2,
      (size - height) / 2,
      width,
      height
    );
    return canvas.toDataURL("image/webp", 0.72);
  } catch {
    return "";
  }
}

function renderComparison(savedProduct) {
  const history = savedProduct?.history ?? [];
  if (!history.length) {
    elements.comparison.hidden = true;
    elements["history-stats"].hidden = true;
    return;
  }

  const last = history.at(-1);
  const sameCurrency = last.currency === currentProduct.currency;
  const comparison = sameCurrency
    ? comparePrices(currentProduct.price, last.price)
    : { amount: null, percentage: null, direction: "unknown" };
  const comparableHistory = history.filter((snapshot) => snapshot.currency === currentProduct.currency);
  const summary = summarizeHistory(comparableHistory);
  elements.comparison.hidden = false;
  elements["previous-price"].textContent = formatMoney(last.price, last.currency);
  elements["previous-date"].textContent = formatDate(last.capturedAt);
  elements["change-card"].className = `change-card ${comparison.direction}`;

  if (comparison.direction === "same") {
    elements["change-value"].textContent = "Sin cambio";
    elements["change-label"].textContent = "mismo precio";
  } else if (comparison.direction === "unknown") {
    elements["change-value"].textContent = "—";
    elements["change-label"].textContent = sameCurrency ? "sin comparación" : "otra moneda";
  } else {
    const sign = comparison.amount > 0 ? "+" : "";
    const percent = comparison.percentage === null ? "" : ` (${sign}${comparison.percentage.toFixed(1)}%)`;
    elements["change-value"].textContent = `${sign}${formatMoney(comparison.amount, currentProduct.currency)}${percent}`;
    elements["change-label"].textContent = comparison.direction === "down" ? "bajó" : "subió";
  }

  elements["history-stats"].hidden = comparableHistory.length === 0;
  if (comparableHistory.length) {
    elements["minimum-price"].textContent = formatMoney(summary.minimum, currentProduct.currency);
    elements["maximum-price"].textContent = formatMoney(summary.maximum, currentProduct.currency);
    elements["history-count"].textContent = String(summary.count);
  }
}

async function renderProduct(product) {
  currentProduct = product;
  elements.status.hidden = true;
  elements.product.hidden = false;
  elements.store.textContent = STORE_LABELS[product.store] ?? product.domain;
  elements["product-title"].textContent = product.title;
  elements["current-price"].textContent = formatMoney(product.price, product.currency);
  if (isLocalProductImage(product.image)) {
    elements["product-image"].src = product.image;
    elements["product-image"].alt = `Imagen de ${product.title}`;
    elements["product-image"].hidden = false;
  }

  if (product.originalPrice && product.originalPrice > product.price) {
    elements["original-price"].textContent = formatMoney(product.originalPrice, product.currency);
    elements["original-price"].hidden = false;
  }
  const variant = formatVariant(product.variant);
  if (variant) {
    elements.variant.textContent = variant;
    elements.variant.hidden = false;
  }

  const details = [product.seller && `Vendido por ${product.seller}`, product.availability, product.shipping].filter(Boolean);
  elements.details.textContent = details.join(" · ") || `Detectado mediante el adaptador ${product.adapter}.`;
  renderComparison(await repository.getProduct(product.id));
}

async function extractCurrentProduct() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url ?? "")) {
    throw new Error("Abre una página de producto en una tienda y vuelve a pulsar la extensión.");
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/extract-product.js"]
  });
  const extraction = results?.[0]?.result;
  if (!extraction?.ok) {
    throw new Error(extraction?.error || "No fue posible reconocer un producto en esta página.");
  }
  const image = await captureProductThumbnail(tab, extraction.product.imageRect);
  return prepareProduct({ ...extraction.product, image });
}

elements.save.addEventListener("click", async () => {
  if (!currentProduct) return;
  elements.save.disabled = true;
  elements["save-feedback"].textContent = "Guardando…";
  try {
    const result = await repository.saveSnapshot(currentProduct);
    elements["save-feedback"].textContent = result.added
      ? "Estado añadido al historial."
      : "No cambió nada; evitamos un registro duplicado.";
    renderComparison(result.product);
  } catch (error) {
    elements["save-feedback"].textContent = error instanceof Error ? error.message : String(error);
  } finally {
    elements.save.disabled = false;
  }
});

elements["open-dashboard"].addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

extractCurrentProduct()
  .then(renderProduct)
  .catch((error) => showError("No encontramos un producto", error instanceof Error ? error.message : String(error)));
