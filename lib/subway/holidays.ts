/**
 * 日本の祝日判定(内閣府「国民の祝日に関する法律」に基づく計算)。
 *
 * - 春分の日・秋分の日は、天文計算による近似式(実用上 1980〜2099 年で十分な精度とされるもの)で求める。
 *   国が官報で確定日を発表するのは毎年2月頃(前年分)だが、この近似式は過去の確定日と一致することが
 *   広く確認されている計算式を用いている。
 * - 「振替休日」(祝日が日曜のとき、直後の祝日でない日を休日にする)と「国民の休日」
 *   (祝日と祝日に挟まれた平日を休日にする)も反映する。
 * - 2020年・2021年は東京五輪の特例法で海の日・スポーツの日・山の日の日付が一時的に変更されたが、
 *   このアプリは当日・近い将来の日付での検索を主な用途とするため、その2年分の特例は反映していない
 *   (2020・2021年の該当日で検索すると、実際とは異なる祝日判定になる場合がある)。
 */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * `formatDateKey` で作った "YYYY-MM-DD" 文字列をローカル時刻の日付として復元する。
 * `new Date("YYYY-MM-DD")` はJS仕様上UTCとして解釈されるため、UTCより遅れたタイムゾーン
 * (例: 米大陸)からのアクセスでは曜日が1日ずれることがある。本アプリは公開Webアプリで
 * 利用者のタイムゾーンを問わないため、年月日の数値からローカル時刻で組み立てる。
 */
function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** 指定月の第n月曜日の日付(1〜31)を返す。 */
function nthMonday(year: number, month: number, n: number): number {
  const first = new Date(year, month - 1, 1);
  const firstMonday = 1 + ((8 - first.getDay()) % 7);
  return firstMonday + (n - 1) * 7;
}

function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function baseHolidaysForYear(year: number): { month: number; day: number; name: string }[] {
  return [
    { month: 1, day: 1, name: "元日" },
    { month: 1, day: nthMonday(year, 1, 2), name: "成人の日" },
    { month: 2, day: 11, name: "建国記念の日" },
    { month: 2, day: 23, name: "天皇誕生日" },
    { month: 3, day: vernalEquinoxDay(year), name: "春分の日" },
    { month: 4, day: 29, name: "昭和の日" },
    { month: 5, day: 3, name: "憲法記念日" },
    { month: 5, day: 4, name: "みどりの日" },
    { month: 5, day: 5, name: "こどもの日" },
    { month: 7, day: nthMonday(year, 7, 3), name: "海の日" },
    { month: 8, day: 11, name: "山の日" },
    { month: 9, day: nthMonday(year, 9, 3), name: "敬老の日" },
    { month: 9, day: autumnalEquinoxDay(year), name: "秋分の日" },
    { month: 10, day: nthMonday(year, 10, 2), name: "スポーツの日" },
    { month: 11, day: 3, name: "文化の日" },
    { month: 11, day: 23, name: "勤労感謝の日" },
  ];
}

function computeHolidaysForYear(year: number): Map<string, string> {
  const base = new Map<string, string>();
  for (const holiday of baseHolidaysForYear(year)) {
    base.set(formatDateKey(new Date(year, holiday.month - 1, holiday.day)), holiday.name);
  }

  // 振替休日: 祝日が日曜のとき、直後の「祝日でない日」を休日にする。
  const withSubstitutes = new Map(base);
  for (const [dateKey, ] of base) {
    const date = parseDateKey(dateKey);
    if (date.getDay() !== 0) continue;
    const substitute = new Date(date);
    do {
      substitute.setDate(substitute.getDate() + 1);
    } while (withSubstitutes.has(formatDateKey(substitute)));
    withSubstitutes.set(formatDateKey(substitute), "振替休日");
  }

  // 国民の休日: 前後を祝日(振替休日含む)に挟まれた、日曜でない平日を休日にする。
  const withNationalHolidays = new Map(withSubstitutes);
  const cursor = new Date(year, 0, 1);
  while (cursor.getFullYear() === year) {
    const key = formatDateKey(cursor);
    if (!withSubstitutes.has(key) && cursor.getDay() !== 0) {
      const previous = new Date(cursor);
      previous.setDate(previous.getDate() - 1);
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      if (withSubstitutes.has(formatDateKey(previous)) && withSubstitutes.has(formatDateKey(next))) {
        withNationalHolidays.set(key, "国民の休日");
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return withNationalHolidays;
}

const holidayCache = new Map<number, Map<string, string>>();

function holidaysForYear(year: number): Map<string, string> {
  let map = holidayCache.get(year);
  if (!map) {
    map = computeHolidaysForYear(year);
    holidayCache.set(year, map);
  }
  return map;
}

export function isJapaneseHoliday(date: Date): boolean {
  return holidaysForYear(date.getFullYear()).has(formatDateKey(date));
}

/** 該当する祝日名(「元日」「振替休日」など)。祝日でなければ null。 */
export function japaneseHolidayName(date: Date): string | null {
  return holidaysForYear(date.getFullYear()).get(formatDateKey(date)) ?? null;
}
