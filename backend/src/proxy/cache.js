export function makeCache() {
  const store = new Map();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt < Date.now()) { store.delete(key); return undefined; }
      return e.value;
    },
    set(key, value, ttlMs) { store.set(key, { value, expiresAt: Date.now() + ttlMs }); },
    size() { return store.size; },
  };
}
