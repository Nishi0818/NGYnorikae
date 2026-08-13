import type { LineId, ServiceDayType } from "./types";

export type OfflineTimetable = Readonly<Record<ServiceDayType, readonly number[]>>;
export type OfflineTimetables = Readonly<Record<string, OfflineTimetable>>;

/** アプリ内に収録した路線別時刻表の基準日。 */
export const TIMETABLE_REVISIONS: Readonly<Record<LineId, string>> = {
  higashiyama: "2025-03-29",
  meijo: "2025-09-29",
  meiko: "2023-01-04",
  tsurumai: "2024-03-16",
  sakuradori: "2023-09-16",
  kamiida: "2024-03-16",
};
