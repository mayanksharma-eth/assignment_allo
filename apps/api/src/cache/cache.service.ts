import { Injectable } from "@nestjs/common";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

@Injectable()
export class CacheService {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 60_000): T {
    const expiresAt = Date.now() + Math.max(ttlMs, 1);
    this.store.set(key, { value, expiresAt });
    return value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  remember<T>(key: string, ttlMs: number, compute: () => T): T {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = compute();
    this.set(key, value, ttlMs);
    return value;
  }
}

