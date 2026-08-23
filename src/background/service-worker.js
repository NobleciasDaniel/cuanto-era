import { StorageRepository } from "../shared/storage.js";

const repository = new StorageRepository();

async function updateBadge() {
  const products = await repository.listProducts();
  const text = products.length ? String(Math.min(products.length, 999)) : "";
  await chrome.action.setBadgeBackgroundColor({ color: "#176b52" });
  await chrome.action.setBadgeText({ text });
}

chrome.runtime.onInstalled.addListener(() => {
  repository.ensureDatabase().then(updateBadge).catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge().catch(console.error);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.precioHuellaDatabase) {
    updateBadge().catch(console.error);
  }
});
