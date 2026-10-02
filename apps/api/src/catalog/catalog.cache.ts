import type { DeviceCatalog } from "@lc-play/contracts";

type CacheEntry = { catalog: DeviceCatalog; expiresAt: number; retryAt: number };

export class CatalogCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<DeviceCatalog>>();

  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
    private readonly retryDelayMs = 30_000,
  ) {}

  async get(key: string, load: () => Promise<DeviceCatalog>): Promise<DeviceCatalog> {
    const cached = this.entries.get(key);
    if (!cached) return this.refresh(key, load);
    // A section change must not wait for another download of the same source.
    if (cached.expiresAt <= this.now() && cached.retryAt <= this.now()) {
      void this.refresh(key, load).catch(() => undefined);
    }
    return cached.catalog;
  }

  private refresh(key: string, load: () => Promise<DeviceCatalog>): Promise<DeviceCatalog> {
    const running = this.pending.get(key);
    if (running) return running;
    const promise = Promise.resolve()
      .then(load)
      .then((catalog) => {
        this.entries.set(key, { catalog, expiresAt: this.now() + this.ttlMs, retryAt: 0 });
        return catalog;
      })
      .catch((error: unknown) => {
        const cached = this.entries.get(key);
        if (cached) cached.retryAt = this.now() + this.retryDelayMs;
        throw error;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
}
