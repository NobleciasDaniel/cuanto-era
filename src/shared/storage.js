import { DATABASE_KEY, DATABASE_VERSION, MAX_HISTORY_PER_PRODUCT } from "./constants.js";
import { snapshotsAreEquivalent } from "./compare.js";
import { normalizeLocalProductImage } from "./image.js";

function createEmptyDatabase() {
  return {
    version: DATABASE_VERSION,
    updatedAt: new Date().toISOString(),
    products: {}
  };
}

function createSnapshot(product, capturedAt = new Date().toISOString()) {
  return {
    capturedAt,
    price: product.price,
    originalPrice: product.originalPrice,
    currency: product.currency,
    seller: product.seller,
    availability: product.availability,
    shipping: product.shipping
  };
}

function assertDatabase(database) {
  if (!database || typeof database !== "object" || Array.isArray(database)) {
    throw new TypeError("El archivo importado no contiene una base de datos válida.");
  }
  if (database.version !== DATABASE_VERSION || typeof database.products !== "object") {
    throw new TypeError(`Solo se admite el formato de Cuánto Era v${DATABASE_VERSION}.`);
  }
}

function isSafeHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export class StorageRepository {
  constructor(storageArea = globalThis.chrome?.storage?.local) {
    if (!storageArea) throw new Error("chrome.storage.local no está disponible.");
    this.storageArea = storageArea;
  }

  async getDatabase() {
    const result = await this.storageArea.get(DATABASE_KEY);
    const database = result?.[DATABASE_KEY];
    if (!database) return createEmptyDatabase();
    assertDatabase(database);
    return database;
  }

  async setDatabase(database) {
    assertDatabase(database);
    database.updatedAt = new Date().toISOString();
    await this.storageArea.set({ [DATABASE_KEY]: database });
    return database;
  }

  async ensureDatabase() {
    const existing = await this.storageArea.get(DATABASE_KEY);
    if (!existing?.[DATABASE_KEY]) await this.setDatabase(createEmptyDatabase());
  }

  async listProducts() {
    const database = await this.getDatabase();
    return Object.values(database.products).sort((left, right) =>
      String(right.lastSeenAt).localeCompare(String(left.lastSeenAt))
    );
  }

  async getProduct(id) {
    const database = await this.getDatabase();
    return database.products[id] ?? null;
  }

  async saveSnapshot(product, capturedAt = new Date().toISOString()) {
    const database = await this.getDatabase();
    const existing = database.products[product.id];
    const snapshot = createSnapshot(product, capturedAt);
    const lastSnapshot = existing?.history?.at(-1);
    const duplicated = snapshotsAreEquivalent(lastSnapshot, snapshot);
    const history = duplicated
      ? [...(existing?.history ?? [])]
      : [...(existing?.history ?? []), snapshot].slice(-MAX_HISTORY_PER_PRODUCT);

    database.products[product.id] = {
      id: product.id,
      store: product.store,
      domain: product.domain,
      productId: product.productId,
      canonicalUrl: product.canonicalUrl,
      title: product.title,
      image: normalizeLocalProductImage(product.image) || existing?.image || "",
      variant: product.variant,
      adapter: product.adapter,
      createdAt: existing?.createdAt ?? capturedAt,
      lastSeenAt: capturedAt,
      history
    };
    await this.setDatabase(database);
    return { product: database.products[product.id], added: !duplicated };
  }

  async deleteProduct(id) {
    const database = await this.getDatabase();
    delete database.products[id];
    await this.setDatabase(database);
  }

  async keepLatestSnapshot(id) {
    const database = await this.getDatabase();
    const product = database.products[id];
    if (!product) return;
    product.history = product.history.length ? [product.history.at(-1)] : [];
    await this.setDatabase(database);
  }

  async importDatabase(imported, { merge = true } = {}) {
    assertDatabase(imported);
    const database = merge ? await this.getDatabase() : createEmptyDatabase();
    for (const [id, product] of Object.entries(imported.products)) {
      if (
        !product ||
        product.id !== id ||
        !/^[a-z0-9_-]{1,80}$/i.test(id) ||
        ["__proto__", "prototype", "constructor"].includes(id.toLowerCase()) ||
        !Array.isArray(product.history) ||
        !isSafeHttpUrl(product.canonicalUrl)
      ) continue;
      const existing = database.products[id];
      const combinedHistory = [...(existing?.history ?? []), ...product.history]
        .filter((snapshot) =>
          snapshot &&
          typeof snapshot.capturedAt === "string" &&
          Number.isFinite(snapshot.price) &&
          typeof snapshot.currency === "string"
        )
        .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
      const uniqueHistory = combinedHistory.filter(
        (snapshot, index, list) => index === 0 || !snapshotsAreEquivalent(list[index - 1], snapshot)
      );
      database.products[id] = {
        id,
        store: String(product.store ?? "generic").slice(0, 64),
        domain: String(product.domain ?? "").slice(0, 255),
        productId: String(product.productId ?? "").slice(0, 160),
        canonicalUrl: product.canonicalUrl,
        title: String(product.title ?? "Producto importado").slice(0, 300),
        image: normalizeLocalProductImage(product.image),
        variant: product.variant && typeof product.variant === "object" && !Array.isArray(product.variant)
          ? product.variant
          : {},
        adapter: String(product.adapter ?? "generic").slice(0, 64),
        createdAt: product.createdAt,
        history: uniqueHistory.slice(-MAX_HISTORY_PER_PRODUCT),
        lastSeenAt: uniqueHistory.at(-1)?.capturedAt ?? product.lastSeenAt
      };
    }
    await this.setDatabase(database);
    return database;
  }
}

export { createEmptyDatabase };
