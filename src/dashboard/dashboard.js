import { comparePrices, summarizeHistory } from "../shared/compare.js";
import { STORE_LABELS } from "../shared/constants.js";
import { isLocalProductImage } from "../shared/image.js";
import { formatMoney } from "../shared/price.js";
import { StorageRepository } from "../shared/storage.js";

const repository = new StorageRepository();
const elements = {
  summary: document.getElementById("summary"),
  search: document.getElementById("search"),
  storeFilter: document.getElementById("store-filter"),
  exportButton: document.getElementById("export"),
  importButton: document.getElementById("import"),
  importFile: document.getElementById("import-file"),
  feedback: document.getElementById("feedback"),
  empty: document.getElementById("empty"),
  grid: document.getElementById("product-grid")
};

let products = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function compactText(value, maximumLength = 80) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= maximumLength ? normalized : `${normalized.slice(0, maximumLength - 1)}…`;
}

function variantLabel(variant) {
  const noisyKey = /cantidad|quantity|provincia|province|pa[ií]s|country|ubicaci[oó]n|location|offline|store|tienda|search|buscar|sort|ordenar|idioma|language/i;
  return Object.entries(variant ?? {})
    .filter(([key, value]) => key && value && key.length <= 48 && String(value).length <= 96 && !noisyKey.test(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function changeLabel(change, currency) {
  if (change.direction === "same") return "Sin cambio";
  if (change.direction === "unknown") return "Sin comparación";
  const sign = change.amount > 0 ? "+" : "";
  const percentage = change.percentage === null ? "" : ` · ${sign}${change.percentage.toFixed(1)}%`;
  return `${sign}${formatMoney(change.amount, currency)}${percentage}`;
}

function appendMetric(container, label, value) {
  const metric = element("div", "metric");
  metric.append(element("span", "", label), element("strong", "", value));
  container.append(metric);
}

function createChart(history, currency) {
  const prices = history.filter((entry) => Number.isFinite(entry.price) && entry.currency === currency);
  if (prices.length < 2) return null;

  const width = 640;
  const height = 120;
  const padding = 10;
  const values = prices.map((entry) => entry.price);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const points = values.map((value, index) => ({
    x: padding + (index / (values.length - 1)) * (width - padding * 2),
    y: height - padding - ((value - minimum) / span) * (height - padding * 2),
    value,
    capturedAt: prices[index].capturedAt
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("chart");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Historial desde ${formatMoney(minimum, currency)} hasta ${formatMoney(maximum, currency)}`);
  const areaPolygon = document.createElementNS(svg.namespaceURI, "polygon");
  areaPolygon.classList.add("chart-area");
  areaPolygon.setAttribute("points", area);
  const polyline = document.createElementNS(svg.namespaceURI, "polyline");
  polyline.classList.add("chart-line");
  polyline.setAttribute("points", line);
  svg.append(areaPolygon, polyline);
  for (const point of points) {
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    circle.classList.add("chart-dot");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", "4");
    const title = document.createElementNS(svg.namespaceURI, "title");
    title.textContent = `${formatDate(point.capturedAt)}: ${formatMoney(point.value, currency)}`;
    circle.append(title);
    svg.append(circle);
  }
  return svg;
}

function createHistoryTable(history) {
  const wrapper = element("div", "history-table-wrapper");
  const table = element("table");
  const head = element("thead");
  const headerRow = element("tr");
  ["Fecha", "Precio", "Vendedor", "Disponibilidad"].forEach((label) => headerRow.append(element("th", "", label)));
  head.append(headerRow);
  const body = element("tbody");
  [...history].reverse().forEach((snapshot) => {
    const row = element("tr");
    row.append(
      element("td", "", formatDate(snapshot.capturedAt)),
      element("td", "", formatMoney(snapshot.price, snapshot.currency)),
      element("td", "", compactText(snapshot.seller) || "—"),
      element("td", "", compactText(snapshot.availability) || "—")
    );
    body.append(row);
  });
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function createCard(product) {
  const summary = summarizeHistory(product.history);
  const currency = summary.current?.currency ?? "USD";
  const card = element("article", "product-card");
  card.dataset.productId = product.id;

  const heading = element("div", "product-main");
  const identity = element("div", "product-identity");
  if (isLocalProductImage(product.image)) {
    const thumbnail = element("img", "product-thumbnail");
    thumbnail.src = product.image;
    thumbnail.alt = "";
    identity.append(thumbnail);
  }
  const copy = element("div", "product-copy");
  copy.append(element("span", "store", `${STORE_LABELS[product.store] ?? product.domain} · ${product.domain}`));
  copy.append(element("h2", "", product.title));
  const variation = variantLabel(product.variant);
  if (variation) copy.append(element("p", "variant", variation));
  identity.append(copy);
  heading.append(identity);

  const priceColumn = element("div", "price-column");
  priceColumn.append(
    element("span", "", summary.current?.capturedAt ? `Capturado ${formatDate(summary.current.capturedAt)}` : "Última captura"),
    element("strong", "", formatMoney(summary.current?.price, currency))
  );
  const priceActions = element("div", "price-actions");
  priceActions.append(element("span", `change ${summary.change.direction}`, changeLabel(summary.change, currency)));
  const visit = element("a", "visit-link", "Abrir producto ↗");
  visit.href = product.canonicalUrl;
  visit.target = "_blank";
  visit.rel = "noopener noreferrer";
  visit.setAttribute("aria-label", `Visitar ${product.title}`);
  priceActions.append(visit);
  priceColumn.append(priceActions);
  heading.append(priceColumn);
  card.append(heading);

  const metrics = element("div", "metrics");
  appendMetric(metrics, "Mínimo", formatMoney(summary.minimum, currency));
  appendMetric(metrics, "Máximo", formatMoney(summary.maximum, currency));
  appendMetric(metrics, "Capturas", String(summary.count));
  card.append(metrics);

  const chart = createChart(product.history, currency);
  if (chart) {
    const trend = element("div", "trend");
    trend.append(chart);
    card.append(trend);
  }

  const details = element("details", "history-details");
  details.append(element("summary", "", `Historial de precios (${summary.count})`), createHistoryTable(product.history));
  card.append(details);

  const actions = element("div", "card-actions");
  const clear = element("button", "text-button", "Conservar solo el último");
  clear.type = "button";
  clear.dataset.action = "clear-history";
  const remove = element("button", "text-button danger", "Eliminar producto");
  remove.type = "button";
  remove.dataset.action = "delete";
  actions.append(clear, remove);
  card.append(actions);
  return card;
}

function renderSummary() {
  const snapshots = products.reduce((count, product) => count + product.history.length, 0);
  const stores = new Set(products.map((product) => product.store)).size;
  const productLabel = products.length === 1 ? "producto" : "productos";
  const captureLabel = snapshots === 1 ? "captura" : "capturas";
  const storeLabel = stores === 1 ? "tienda" : "tiendas";
  elements.summary.textContent = `${products.length} ${productLabel} · ${snapshots} ${captureLabel} · ${stores} ${storeLabel}`;
}

function renderFilters() {
  const selected = elements.storeFilter.value;
  const stores = [...new Set(products.map((product) => product.store))].sort();
  elements.storeFilter.replaceChildren(new Option("Todas las tiendas", ""));
  stores.forEach((store) => elements.storeFilter.add(new Option(STORE_LABELS[store] ?? store, store)));
  elements.storeFilter.value = stores.includes(selected) ? selected : "";
}

function renderProducts() {
  const query = elements.search.value.trim().toLowerCase();
  const store = elements.storeFilter.value;
  const filtered = products.filter((product) => {
    const matchesStore = !store || product.store === store;
    const haystack = `${product.title} ${product.domain} ${STORE_LABELS[product.store] ?? ""}`.toLowerCase();
    return matchesStore && (!query || haystack.includes(query));
  });
  elements.grid.replaceChildren(...filtered.map(createCard));
  elements.empty.hidden = filtered.length > 0;
  if (!products.length) {
    elements.empty.querySelector("h2").textContent = "Todavía no hay precios guardados";
    elements.empty.querySelector("p").textContent = "Visita un producto, abre Cuánto Era y pulsa “Guardar este precio”.";
  } else if (!filtered.length) {
    elements.empty.querySelector("h2").textContent = "No encontramos coincidencias";
    elements.empty.querySelector("p").textContent = "Prueba con otro texto o elimina el filtro de tienda.";
  }
}

function setFeedback(message, error = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle("error", error);
}

async function refresh() {
  products = await repository.listProducts();
  renderSummary();
  renderFilters();
  renderProducts();
}

elements.search.addEventListener("input", renderProducts);
elements.storeFilter.addEventListener("change", renderProducts);

elements.grid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  const card = button?.closest("[data-product-id]");
  if (!button || !card) return;
  const product = products.find((item) => item.id === card.dataset.productId);
  if (!product) return;

  if (button.dataset.action === "delete") {
    if (!confirm(`¿Eliminar “${product.title}” y todo su historial?`)) return;
    await repository.deleteProduct(product.id);
    setFeedback("Producto eliminado.");
  } else if (button.dataset.action === "clear-history") {
    if (!confirm("¿Conservar únicamente el registro más reciente?")) return;
    await repository.keepLatestSnapshot(product.id);
    setFeedback("Historial reducido al último registro.");
  }
  await refresh();
});

elements.exportButton.addEventListener("click", async () => {
  const database = await repository.getDatabase();
  const blob = new Blob([JSON.stringify(database, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cuanto-era-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setFeedback("Copia exportada.");
});

elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", async () => {
  const [file] = elements.importFile.files;
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    const merge = confirm("Aceptar: combinar con los datos actuales.\nCancelar: reemplazar todos los datos.");
    await repository.importDatabase(imported, { merge });
    setFeedback("Importación terminada.");
    await refresh();
  } catch (error) {
    setFeedback(error instanceof Error ? error.message : String(error), true);
  } finally {
    elements.importFile.value = "";
  }
});

refresh().catch((error) => setFeedback(error instanceof Error ? error.message : String(error), true));
