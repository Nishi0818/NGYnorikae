export const FAVORITES_LIMIT = 6;
export const FAVORITES_STORAGE_KEY = "nagoya-subway.favorites.v1";

export type FavoriteRoute = {
  id: string;
  origin: string;
  destination: string;
  savedAt: string;
};

export function favoriteId(origin: string, destination: string) {
  return `${origin}::${destination}`;
}

function isFavoriteRoute(value: unknown): value is FavoriteRoute {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<FavoriteRoute>;
  return typeof entry.id === "string"
    && typeof entry.origin === "string"
    && typeof entry.destination === "string"
    && typeof entry.savedAt === "string";
}

export function parseFavorites(raw: string | null): FavoriteRoute[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFavoriteRoute).slice(0, FAVORITES_LIMIT);
  } catch {
    return [];
  }
}

export function isFavorite(current: readonly FavoriteRoute[], origin: string, destination: string) {
  return current.some((entry) => entry.id === favoriteId(origin, destination));
}

/** 追加は先頭へ。同じ経路が既にあれば何もしない。 */
export function addFavorite(current: readonly FavoriteRoute[], next: FavoriteRoute): FavoriteRoute[] {
  if (isFavorite(current, next.origin, next.destination)) return [...current];
  return [next, ...current].slice(0, FAVORITES_LIMIT);
}

export function removeFavorite(current: readonly FavoriteRoute[], id: string): FavoriteRoute[] {
  return current.filter((entry) => entry.id !== id);
}

/** お気に入りは利用者のブラウザ端末だけに保存し、サーバーへ送信しない。 */
export function loadFavorites(): FavoriteRoute[] {
  if (typeof window === "undefined") return [];
  return parseFavorites(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
}

export function saveFavorites(entries: readonly FavoriteRoute[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(entries.slice(0, FAVORITES_LIMIT)));
}
