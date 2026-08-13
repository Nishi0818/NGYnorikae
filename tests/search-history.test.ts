import { describe, expect, it } from "vitest";

import { SEARCH_HISTORY_LIMIT, mergeSearchHistory, parseSearchHistory, type SearchHistoryEntry } from "../lib/subway/search-history";

function entry(id: string): SearchHistoryEntry {
  return { id, origin: "一社", destination: "丸の内", dateText: "2026-08-13", timeText: "10:09", dayMode: "auto", savedAt: "2026-08-13T00:00:00.000Z" };
}

describe("検索履歴", () => {
  it("最新の検索を先頭へ移し、重複を残さず最大件数に収める", () => {
    const history = Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, index) => entry(String(index)));
    const updated = mergeSearchHistory(history, entry("2"));

    expect(updated).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(updated[0]?.id).toBe("2");
    expect(updated.filter((item) => item.id === "2")).toHaveLength(1);
  });

  it("壊れた保存データを無視し、有効な履歴だけを復元する", () => {
    expect(parseSearchHistory("not-json")).toEqual([]);
    expect(parseSearchHistory(JSON.stringify([entry("valid"), { origin: "一社" }]))).toEqual([entry("valid")]);
  });
});
