import { describe, expect, it } from "vitest";

import { findDepartureOptions, findTimedRoute } from "../lib/subway/network";

describe("findDepartureOptions", () => {
  it("昼間は出発時刻の昇順に複数候補が並び、終電印は付かない", async () => {
    const options = await findDepartureOptions({
      origin: "いりなか",
      destination: "ナゴヤドーム前矢田",
      departureMinutes: 12 * 60,
      dayType: "weekday",
      preference: "fastest",
      count: 3,
    });
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < options.length; i += 1) {
      expect(options[i].route.actualDepartureMinutes).toBeGreaterThan(options[i - 1].route.actualDepartureMinutes);
    }
    expect(options.every((option) => !option.isLastTrain)).toBe(true);
    // 先頭は通常検索の結果と一致する
    const primary = await findTimedRoute({
      origin: "いりなか",
      destination: "ナゴヤドーム前矢田",
      departureMinutes: 12 * 60,
      dayType: "weekday",
      preference: "fastest",
    });
    expect(options[0].route.actualDepartureMinutes).toBe(primary?.actualDepartureMinutes);
    expect(options[0].route.arrivalMinutes).toBe(primary?.arrivalMinutes);
  });

  it("深夜は残りの便を列挙し、最後の1件だけ終電になる", async () => {
    const options = await findDepartureOptions({
      origin: "上飯田",
      destination: "平安通",
      departureMinutes: 23 * 60,
      dayType: "weekday",
      preference: "fastest",
      count: 20,
    });
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.length).toBeLessThan(20);
    expect(options[options.length - 1].isLastTrain).toBe(true);
    expect(options.slice(0, -1).every((option) => !option.isLastTrain)).toBe(true);
    for (let i = 1; i < options.length; i += 1) {
      expect(options[i].route.actualDepartureMinutes).toBeGreaterThan(options[i - 1].route.actualDepartureMinutes);
    }
  });

  it("不正な駅では空を返す", async () => {
    await expect(findDepartureOptions({
      origin: "存在しない駅",
      destination: "平安通",
      departureMinutes: 12 * 60,
      dayType: "weekday",
      preference: "fastest",
    })).resolves.toEqual([]);
  });
});
