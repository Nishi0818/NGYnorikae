import { describe, expect, it } from "vitest";

import {
  ALL_STATIONS,
  MINIMUM_TRANSFER_MINUTES,
  STATION_READINGS,
  findTimedRoute,
  findTimedRouteOptions,
  findTransferAlternatives,
  getLineForStation,
  getStationsForLine,
  getTransferMinutes,
  getServiceDayType,
  matchesStationQuery,
  toHiragana,
} from "../lib/subway/network";
import { TIMETABLE_REVISIONS } from "../lib/subway/timetable-meta";

describe("名古屋市営地下鉄オフライン経路探索", () => {
  it("全6路線の駅を検索候補として収録する", () => {
    expect(ALL_STATIONS).toHaveLength(87);
    expect(ALL_STATIONS).toContain("高畑");
    expect(ALL_STATIONS).toContain("名古屋港");
    expect(ALL_STATIONS).toContain("赤池");
    expect(ALL_STATIONS).toContain("徳重");
    expect(ALL_STATIONS).toContain("上飯田");
  });

  it("路線別の駅選択では、該当路線だけを路線順に返す", () => {
    expect(getStationsForLine("meiko")).toEqual(["金山", "日比野", "六番町", "東海通", "港区役所", "築地口", "名古屋港"]);
    expect(getStationsForLine("kamiida")).toEqual(["平安通", "上飯田"]);
    expect(getStationsForLine("all")).toHaveLength(87);
  });

  it("名港線の収録時刻表基準日を生成元のメタデータと一致させる", () => {
    expect(TIMETABLE_REVISIONS.meiko).toBe("2023-01-04");
  });

  it("全87駅に読みがなを収録する", () => {
    expect(Object.keys(STATION_READINGS)).toHaveLength(87);
    for (const station of ALL_STATIONS) {
      expect(STATION_READINGS[station]).toBeTruthy();
    }
  });

  it("カタカナをひらがなへ変換する", () => {
    expect(toHiragana("アサマチョウ")).toBe("あさまちょう");
    expect(toHiragana("いりなか")).toBe("いりなか");
  });

  it("駅名検索は入力途中の漢字・ひらがな・カタカナのいずれにも一致する", () => {
    expect(matchesStationQuery("浅間町", "浅間")).toBe(true);
    expect(matchesStationQuery("浅間町", "せんげ")).toBe(true);
    expect(matchesStationQuery("浅間町", "セン")).toBe(true);
    expect(matchesStationQuery("浅間町", "たかばた")).toBe(false);
    expect(matchesStationQuery("浅間町", "")).toBe(true);
  });

  it("読みがなの一致は前方一致のみで、無関係な駅の読みの途中にはヒットしない", () => {
    expect(matchesStationQuery("浅間町", "せ")).toBe(true);
    expect(matchesStationQuery("総合リハビリセンター", "せ")).toBe(false);
    expect(matchesStationQuery("中村日赤", "せ")).toBe(false);
  });

  it("曜日から平日・土休日の時刻表区分を判定する", () => {
    expect(getServiceDayType(new Date(2026, 7, 10))).toBe("weekday");
    expect(getServiceDayType(new Date(2026, 7, 15))).toBe("holiday");
  });

  it("駅・路線ペアごとの乗換時間を対称に参照し、未設定値には既定値を使う", () => {
    expect(getTransferMinutes("金山", "meijo", "meiko")).toBe(2);
    expect(getTransferMinutes("金山", "meiko", "meijo")).toBe(2);
    expect(getTransferMinutes("名古屋", "higashiyama", "sakuradori")).toBe(7);
    expect(getTransferMinutes("伏見", "higashiyama", "sakuradori")).toBe(MINIMUM_TRANSFER_MINUTES);
  });

  it("出発マーカーは駅の路線色を使い、経路が確定した場合は最初の乗車路線を優先する", () => {
    expect(getLineForStation("ナゴヤドーム前矢田")?.color).toBe("#8E3A90");
    expect(getLineForStation("名古屋", "sakuradori")?.color).toBe("#E24B3B");
    expect(getLineForStation("名古屋", "higashiyama")?.color).toBe("#F5C400");
  });

  it("同一路線の経路で、指定時刻以降の公式収録時刻表から列車を選択する", async () => {
    const route = await findTimedRoute({
      origin: "高畑",
      destination: "藤が丘",
      departureMinutes: 8 * 60,
      dayType: "weekday",
    });

    expect(route).not.toBeNull();
    expect(route?.actualDepartureMinutes).toBeGreaterThanOrEqual(8 * 60);
    expect(route?.arrivalMinutes).toBeGreaterThan(route?.actualDepartureMinutes ?? 0);
    expect(route?.legs).toHaveLength(1);
    expect(route?.legs[0]?.lineName).toBe("東山線");
  });

  it("土休日区分でも同梱した休日時刻表から列車を選択する", async () => {
    const route = await findTimedRoute({
      origin: "高畑",
      destination: "名古屋",
      departureMinutes: 8 * 60,
      dayType: "holiday",
    });

    expect(route).not.toBeNull();
    expect(route?.actualDepartureMinutes).toBeGreaterThanOrEqual(8 * 60);
    expect(route?.legs[0]?.lineName).toBe("東山線");
  });

  it("乗換を含む経路では最低乗換時間を接続条件に含める", async () => {
    const route = await findTimedRoute({
      origin: "栄",
      destination: "名古屋港",
      departureMinutes: 8 * 60,
      dayType: "weekday",
    });

    expect(route).not.toBeNull();
    expect(route?.transferCount).toBeGreaterThanOrEqual(1);
    expect(route?.legs.length).toBeGreaterThanOrEqual(2);
    const transferMinutes = getTransferMinutes("金山", "meijo", "meiko");
    expect(route?.legs[1]?.transferMinutes).toBe(transferMinutes);
    expect(route?.legs[1]?.departureMinutes).toBeGreaterThanOrEqual(
      (route?.legs[0]?.arrivalMinutes ?? 0) + transferMinutes,
    );
  });

  it("一社から丸の内は伏見で鶴舞線へ乗り換える経路を返す", async () => {
    const route = await findTimedRoute({
      origin: "一社",
      destination: "丸の内",
      departureMinutes: 10 * 60 + 9,
      dayType: "weekday",
    });

    expect(route?.transferCount).toBe(1);
    expect(route?.legs).toHaveLength(2);
    expect(route?.legs[0]).toMatchObject({ lineName: "東山線", alightStation: "伏見" });
    expect(route?.legs[1]).toMatchObject({ lineName: "鶴舞線", boardStation: "伏見", alightStation: "丸の内" });
  });

  it("最短と乗換少なめの比較結果を同一条件で返し、乗換少なめは乗換回数を増やさない", async () => {
    const options = await findTimedRouteOptions({
      origin: "一社",
      destination: "丸の内",
      departureMinutes: 10 * 60 + 9,
      dayType: "weekday",
    });

    expect(options.fastest).not.toBeNull();
    expect(options.fewestTransfers).not.toBeNull();
    expect(options.fewestTransfers?.transferCount).toBeLessThanOrEqual(options.fastest?.transferCount ?? Infinity);
  });

  it("浅間町から名古屋は、丸の内経由と伏見経由の2つの乗換パターンを返す", async () => {
    const alternatives = await findTransferAlternatives({
      origin: "浅間町",
      destination: "名古屋",
      departureMinutes: 8 * 60,
      dayType: "weekday",
    });

    expect(alternatives).toHaveLength(2);
    const viaStations = alternatives.map((route) => route.legs[1]?.boardStation).sort();
    expect(viaStations).toEqual(["丸の内", "伏見"].sort());
    expect(alternatives[0].arrivalMinutes).toBeLessThanOrEqual(alternatives[1].arrivalMinutes);
  });

  it("直通経路や代替が無い場合は1件だけ返す", async () => {
    const direct = await findTransferAlternatives({
      origin: "高畑",
      destination: "藤が丘",
      departureMinutes: 8 * 60,
      dayType: "weekday",
    });
    expect(direct).toHaveLength(1);
    expect(direct[0].transferCount).toBe(0);
  });

  it("対象外の駅が指定された場合は、誤った候補を返さない", async () => {
    const route = await findTimedRoute({
      origin: "存在しない駅",
      destination: "栄",
      departureMinutes: 8 * 60,
      dayType: "weekday",
    });

    expect(route).toBeNull();
  });
});
