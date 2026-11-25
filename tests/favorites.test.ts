import { describe, expect, it } from "vitest";

import { addFavorite, favoriteId, isFavorite, parseFavorites, removeFavorite, type FavoriteRoute } from "../lib/subway/favorites";

const fav = (origin: string, destination: string): FavoriteRoute => ({
  id: favoriteId(origin, destination),
  origin,
  destination,
  savedAt: "2026-11-25T00:00:00.000Z",
});

describe("favorites", () => {
  it("追加・重複防止・削除ができる", () => {
    let list: FavoriteRoute[] = [];
    list = addFavorite(list, fav("いりなか", "ナゴヤドーム前矢田"));
    list = addFavorite(list, fav("栄", "久屋大通"));
    expect(list.map((entry) => entry.id)).toEqual([favoriteId("栄", "久屋大通"), favoriteId("いりなか", "ナゴヤドーム前矢田")]);
    // 同じ経路の再追加は重複させない
    list = addFavorite(list, fav("いりなか", "ナゴヤドーム前矢田"));
    expect(list).toHaveLength(2);
    expect(isFavorite(list, "いりなか", "ナゴヤドーム前矢田")).toBe(true);
    expect(isFavorite(list, "栄", "伏見")).toBe(false);
    list = removeFavorite(list, favoriteId("いりなか", "ナゴヤドーム前矢田"));
    expect(list.map((entry) => entry.id)).toEqual([favoriteId("栄", "久屋大通")]);
  });

  it("上限を超える追加は古いものから押し出す", () => {
    let list: FavoriteRoute[] = [];
    for (let i = 0; i < 8; i += 1) list = addFavorite(list, fav(`駅${i}`, `駅${i + 100}`));
    expect(list).toHaveLength(6);
    expect(list[0].origin).toBe("駅7");
  });

  it("壊れた保存値は空として扱い、不正な要素は捨てる", () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites("not json")).toEqual([]);
    expect(parseFavorites("{}")).toEqual([]);
    const mixed = JSON.stringify([fav("栄", "伏見"), { id: 1 }, null, "x"]);
    expect(parseFavorites(mixed)).toEqual([fav("栄", "伏見")]);
  });
});
