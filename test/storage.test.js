import test from "node:test";
import assert from "node:assert/strict";

import { DATABASE_KEY } from "../src/shared/constants.js";
import { StorageRepository, createEmptyDatabase } from "../src/shared/storage.js";

class FakeStorageArea {
  constructor() {
    this.data = {};
  }

  async get(key) {
    return { [key]: structuredClone(this.data[key]) };
  }

  async set(values) {
    Object.assign(this.data, structuredClone(values));
  }
}

function product(price = 1000) {
  return {
    id: "amazon-deadbeef",
    store: "amazon",
    domain: "amazon.com.mx",
    productId: "B012345678",
    canonicalUrl: "https://amazon.com.mx/dp/B012345678",
    title: "Producto de prueba",
    image: "",
    variant: { color: "Negro" },
    adapter: "amazon",
    price,
    originalPrice: 1200,
    currency: "MXN",
    seller: "Tienda oficial",
    availability: "Disponible",
    shipping: "Entrega mañana"
  };
}

test("guarda estados y evita duplicados", async () => {
  const repository = new StorageRepository(new FakeStorageArea());
  const first = await repository.saveSnapshot(product(), "2026-01-01T00:00:00.000Z");
  const duplicate = await repository.saveSnapshot(product(), "2026-01-02T00:00:00.000Z");
  const changed = await repository.saveSnapshot(product(900), "2026-01-03T00:00:00.000Z");
  assert.equal(first.added, true);
  assert.equal(duplicate.added, false);
  assert.equal(changed.added, true);
  assert.equal(changed.product.history.length, 2);
  assert.equal(changed.product.history.at(-1).price, 900);
  assert.equal(changed.product.lastSeenAt, "2026-01-03T00:00:00.000Z");
});

test("reduce el historial y elimina productos", async () => {
  const repository = new StorageRepository(new FakeStorageArea());
  await repository.saveSnapshot(product(1000), "2026-01-01T00:00:00.000Z");
  await repository.saveSnapshot(product(900), "2026-01-02T00:00:00.000Z");
  await repository.keepLatestSnapshot(product().id);
  assert.equal((await repository.getProduct(product().id)).history.length, 1);
  await repository.deleteProduct(product().id);
  assert.equal(await repository.getProduct(product().id), null);
});

test("importa una copia válida y combina historiales", async () => {
  const storage = new FakeStorageArea();
  const repository = new StorageRepository(storage);
  await repository.saveSnapshot(product(1000), "2026-01-01T00:00:00.000Z");
  const imported = createEmptyDatabase();
  imported.products[product().id] = {
    ...product(800),
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-02-01T00:00:00.000Z",
    history: [{
      capturedAt: "2026-02-01T00:00:00.000Z",
      price: 800,
      originalPrice: 1200,
      currency: "MXN",
      seller: "Tienda oficial",
      availability: "Disponible",
      shipping: "Entrega mañana"
    }]
  };
  await repository.importDatabase(imported, { merge: true });
  const merged = storage.data[DATABASE_KEY].products[product().id];
  assert.deepEqual(merged.history.map((entry) => entry.price), [1000, 800]);
});

test("rechaza claves peligrosas al importar", async () => {
  const storage = new FakeStorageArea();
  const repository = new StorageRepository(storage);
  const imported = JSON.parse(`{
    "version": 1,
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "products": {
      "__proto__": {
        "id": "__proto__",
        "canonicalUrl": "https://example.com/product",
        "history": []
      }
    }
  }`);
  await repository.importDatabase(imported, { merge: false });
  assert.equal(Object.hasOwn(storage.data[DATABASE_KEY].products, "__proto__"), false);
});
