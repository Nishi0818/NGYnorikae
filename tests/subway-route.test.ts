import { describe, expect, it } from "vitest";

import {
  ALL_STATIONS,
  MINIMUM_TRANSFER_MINUTES,
  STATION_READINGS,
  findTimedRoute,
  findTimedRouteByArrival,
  findTimedRouteByArrivalOptions,
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

  it("到着時刻指定でも同一路線の直通経路を返し、指定時刻までに到着する", async () => {
    const route = await findTimedRouteByArrival({
      origin: "高畑",
      destination: "藤が丘",
      arrivalByMinutes: 9 * 60,
      dayType: "weekday",
    });

    expect(route).not.toBeNull();
    expect(route?.arrivalMinutes).toBeLessThanOrEqual(9 * 60);
    expect(route?.actualDepartureMinutes).toBeLessThan(route?.arrivalMinutes ?? 0);
    expect(route?.legs).toHaveLength(1);
    expect(route?.legs[0]?.lineName).toBe("東山線");
  });

  it("到着時刻指定の結果は、同じ出発時刻で前向き検索した結果と一致する(往復整合性)", async () => {
    const byArrival = await findTimedRouteByArrival({
      origin: "高畑",
      destination: "藤が丘",
      arrivalByMinutes: 9 * 60,
      dayType: "weekday",
    });
    expect(byArrival).not.toBeNull();

    const byDeparture = await findTimedRoute({
      origin: "高畑",
      destination: "藤が丘",
      departureMinutes: byArrival!.actualDepartureMinutes,
      dayType: "weekday",
    });

    expect(byDeparture).not.toBeNull();
    expect(byDeparture?.arrivalMinutes).toBe(byArrival?.arrivalMinutes);
    expect(byDeparture?.legs.map((leg) => ({ ...leg, distanceKm: undefined }))).toEqual(
      byArrival?.legs.map((leg) => ({ ...leg, distanceKm: undefined })),
    );
    expect(byDeparture?.distanceKm).toBeCloseTo(byArrival?.distanceKm ?? -1, 6);
  });

  it("到着時刻指定でも乗換を含む経路を、乗換時間を確保して返す(前向き検索との往復整合性で検証)", async () => {
    const route = await findTimedRouteByArrival({
      origin: "一社",
      destination: "丸の内",
      arrivalByMinutes: 11 * 60,
      dayType: "weekday",
    });

    expect(route).not.toBeNull();
    expect(route?.arrivalMinutes).toBeLessThanOrEqual(11 * 60);
    expect(route?.transferCount).toBeGreaterThanOrEqual(1);
    expect(route?.legs.length).toBeGreaterThanOrEqual(2);

    // 乗換区間は、実際に採用された乗換駅・路線の組合せに対する最低乗換時間を満たしていること。
    const transferLeg = route!.legs[1];
    const previousLeg = route!.legs[0];
    const expectedTransferMinutes = getTransferMinutes(transferLeg.boardStation, previousLeg.lineId, transferLeg.lineId);
    expect(transferLeg.transferMinutes).toBe(expectedTransferMinutes);
    expect(transferLeg.departureMinutes).toBeGreaterThanOrEqual(previousLeg.arrivalMinutes + expectedTransferMinutes);

    // 同じ出発時刻で前向き検索しても、同一の経路・同一の到着時刻になること(採用した乗換駅によらず正しいことの確認)。
    const forward = await findTimedRoute({
      origin: "一社",
      destination: "丸の内",
      departureMinutes: route!.actualDepartureMinutes,
      dayType: "weekday",
    });
    expect(forward?.arrivalMinutes).toBe(route?.arrivalMinutes);
    expect(forward?.legs.map((leg) => leg.lineId)).toEqual(route?.legs.map((leg) => leg.lineId));
  });

  it("到着時刻指定の最短と乗換少なめは、乗換少なめの方が乗換回数を増やさない", async () => {
    const options = await findTimedRouteByArrivalOptions({
      origin: "一社",
      destination: "丸の内",
      arrivalByMinutes: 11 * 60,
      dayType: "weekday",
    });

    expect(options.fastest).not.toBeNull();
    expect(options.fewestTransfers).not.toBeNull();
    expect(options.fastest?.arrivalMinutes).toBeLessThanOrEqual(11 * 60);
    expect(options.fewestTransfers?.arrivalMinutes).toBeLessThanOrEqual(11 * 60);
    expect(options.fewestTransfers?.transferCount).toBeLessThanOrEqual(options.fastest?.transferCount ?? Infinity);
  });

  it("到着時刻指定でも対象外の駅では誤った候補を返さない", async () => {
    const route = await findTimedRouteByArrival({
      origin: "存在しない駅",
      destination: "栄",
      arrivalByMinutes: 9 * 60,
      dayType: "weekday",
    });

    expect(route).toBeNull();
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

  describe("到着時刻指定の広域整合性(前向き検索との突き合わせ)", () => {
    // 出発駅・到着駅・到着期限をランダムに組み合わせ、到着時刻指定の結果が
    //   1) 同じ出発時刻で前向き検索した結果と完全に一致する
    //   2) 1分でも遅く出発すると期限に間に合わなくなる(=本当に最遅の出発である)
    // ことを検証する回帰テスト。手作りの逆向き探索を試した際にここで実データ不整合が
    // 複数見つかったため、実装を前向き探索ベースに切り替えた経緯がある。
    function pick<T>(arr: readonly T[], seed: number): T {
      return arr[seed % arr.length];
    }

    let seed = 7;
    const cases: { origin: string; destination: string; arrivalByMinutes: number }[] = [];
    for (let i = 0; i < 24; i += 1) {
      seed = (seed * 9301 + 49297) % 233280;
      const origin = pick(ALL_STATIONS, seed);
      seed = (seed * 9301 + 49297) % 233280;
      let destination = pick(ALL_STATIONS, seed);
      if (destination === origin) destination = pick(ALL_STATIONS, seed + 1);
      seed = (seed * 9301 + 49297) % 233280;
      const arrivalByMinutes = 5 * 60 + (seed % (20 * 60));
      cases.push({ origin, destination, arrivalByMinutes });
    }

    for (const testCase of cases) {
      it(`${testCase.origin} → ${testCase.destination}(${testCase.arrivalByMinutes}分までに到着)`, async () => {
        const byArrival = await findTimedRouteByArrival({ ...testCase, dayType: "weekday" });
        if (!byArrival) return;
        expect(byArrival.arrivalMinutes).toBeLessThanOrEqual(testCase.arrivalByMinutes);

        const forward = await findTimedRoute({
          origin: testCase.origin,
          destination: testCase.destination,
          departureMinutes: byArrival.actualDepartureMinutes,
          dayType: "weekday",
        });
        expect(forward?.arrivalMinutes).toBe(byArrival.arrivalMinutes);
        expect(forward?.legs.map((leg) => `${leg.lineId}:${leg.boardStation}:${leg.alightStation}`)).toEqual(
          byArrival.legs.map((leg) => `${leg.lineId}:${leg.boardStation}:${leg.alightStation}`),
        );

        const oneMinuteLater = await findTimedRoute({
          origin: testCase.origin,
          destination: testCase.destination,
          departureMinutes: byArrival.actualDepartureMinutes + 1,
          dayType: "weekday",
        });
        if (oneMinuteLater) {
          expect(oneMinuteLater.arrivalMinutes).toBeGreaterThan(testCase.arrivalByMinutes);
        }
      });
    }
  });
});
