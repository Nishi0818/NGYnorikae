import type { ServiceDayType } from "./types";

export const SEARCH_HISTORY_LIMIT = 5;
export const SEARCH_HISTORY_STORAGE_KEY = "nagoya-subway.search-history.v1";

export type SearchHistoryEntry = {
  id: string;
  origin: string;
  destination: string;
  dateText: string;
  timeText: string;
  dayMode: "auto" | ServiceDayType;
  savedAt: string;
};

function isSearchHistoryEntry(value: unknown): value is SearchHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SearchHistoryEntry>;
  return typeof entry.id === "string"
    && typeof entry.origin === "string"
    && typeof entry.destination === "string"
    && typeof entry.dateText === "string"
    && typeof entry.timeText === "string"
    && (entry.dayMode === "auto" || entry.dayMode === "weekday" || entry.dayMode === "holiday")
    && typeof entry.savedAt === "string";
}

export function parseSearchHistory(raw: string | null): SearchHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSearchHistoryEntry).slice(0, SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function mergeSearchHistory(current: readonly SearchHistoryEntry[], next: SearchHistoryEntry): SearchHistoryEntry[] {
  return [next, ...current.filter((entry) => entry.id !== next.id)].slice(0, SEARCH_HISTORY_LIMIT);
}

/** ウェブ版では利用者のブラウザ端末だけに保存し、サーバーへ検索内容を送信しない。 */
export function loadSearchHistory(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return parseSearchHistory(window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY));
}

export function saveSearchHistory(entries: readonly SearchHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, SEARCH_HISTORY_LIMIT)));
}
