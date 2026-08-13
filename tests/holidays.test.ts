import { describe, expect, it } from "vitest";
import { isJapaneseHoliday, japaneseHolidayName } from "../lib/subway/holidays";
import { getServiceDayType } from "../lib/subway/network";

describe("日本の祝日判定", () => {
  it("固定日の祝日を判定する", () => {
    expect(japaneseHolidayName(new Date(2026, 0, 1))).toBe("元日");
    expect(japaneseHolidayName(new Date(2026, 10, 3))).toBe("文化の日");
  });

  it("ハッピーマンデーの祝日を第n月曜として判定する", () => {
    expect(japaneseHolidayName(new Date(2026, 0, 12))).toBe("成人の日");
    expect(new Date(2026, 0, 12).getDay()).toBe(1); // 月曜であること自体も確認する
  });

  it("春分の日・秋分の日を計算する", () => {
    expect(japaneseHolidayName(new Date(2026, 2, 20))).toBe("春分の日");
    expect(japaneseHolidayName(new Date(2026, 8, 23))).toBe("秋分の日");
  });

  it("祝日が日曜のときは振替休日を翌平日に設定する", () => {
    // 2025年5月4日(みどりの日)は日曜のため、5月6日(火、5日は こどもの日)が振替休日になる。
    expect(japaneseHolidayName(new Date(2025, 4, 4))).toBe("みどりの日");
    expect(japaneseHolidayName(new Date(2025, 4, 5))).toBe("こどもの日");
    expect(japaneseHolidayName(new Date(2025, 4, 6))).toBe("振替休日");
  });

  it("祝日と祝日に挟まれた平日を国民の休日とする(2026年のシルバーウィーク)", () => {
    expect(japaneseHolidayName(new Date(2026, 8, 21))).toBe("敬老の日");
    expect(japaneseHolidayName(new Date(2026, 8, 22))).toBe("国民の休日");
    expect(japaneseHolidayName(new Date(2026, 8, 23))).toBe("秋分の日");
  });

  it("祝日でない平日はnullを返す", () => {
    expect(japaneseHolidayName(new Date(2026, 7, 13))).toBeNull();
    expect(isJapaneseHoliday(new Date(2026, 7, 13))).toBe(false);
  });

  it("getServiceDayTypeは祝日の平日を土休日ダイヤとして扱う", () => {
    // 2026年11月3日(文化の日)は火曜日だが、祝日として土休日ダイヤになる。
    const cultureDay = new Date(2026, 10, 3);
    expect(cultureDay.getDay()).toBe(2);
    expect(getServiceDayType(cultureDay)).toBe("holiday");
    // 祝日でも週末でもない平日は平日ダイヤのまま。
    expect(getServiceDayType(new Date(2026, 7, 13))).toBe("weekday");
  });
});
