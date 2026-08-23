const SNAPSHOT_FIELDS = [
  "price",
  "originalPrice",
  "currency",
  "seller",
  "availability",
  "shipping"
];

export function snapshotsAreEquivalent(left, right) {
  if (!left || !right) return false;
  return SNAPSHOT_FIELDS.every((field) => (left[field] ?? null) === (right[field] ?? null));
}

export function comparePrices(currentPrice, previousPrice) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(previousPrice)) {
    return { amount: null, percentage: null, direction: "unknown" };
  }
  const amount = currentPrice - previousPrice;
  const percentage = previousPrice === 0 ? null : (amount / previousPrice) * 100;
  return {
    amount,
    percentage,
    direction: amount < 0 ? "down" : amount > 0 ? "up" : "same"
  };
}

export function summarizeHistory(history = []) {
  const priced = history.filter((snapshot) => Number.isFinite(snapshot.price));
  const current = priced.at(-1) ?? null;
  const comparable = current
    ? priced.filter((snapshot) => snapshot.currency === current.currency)
    : [];
  const prices = comparable.map((snapshot) => snapshot.price);
  const previous = comparable.length > 1 ? comparable.at(-2) : null;
  return {
    count: history.length,
    current,
    previous,
    minimum: prices.length ? Math.min(...prices) : null,
    maximum: prices.length ? Math.max(...prices) : null,
    change: comparePrices(current?.price, previous?.price)
  };
}
