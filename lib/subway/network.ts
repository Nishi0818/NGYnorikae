import { TIMETABLE_REVISIONS, type OfflineTimetables } from "./timetable-meta";
import type { LineId, RouteLeg, ServiceDayType, SubwayLine, TimedRoute } from "./types";

export { TIMETABLE_REVISIONS };

let offlineTimetablesPromise: Promise<OfflineTimetables> | undefined;

/**
 * 駅・路線の選択画面を軽量に保つため、巨大な時刻表本体は検索が実行された時点でのみ読み込む。
 * 読み込み後は同じPromiseを共有するため、以後の検索はオフラインのメモリ内データを利用する。
 */
async function loadOfflineTimetables(): Promise<OfflineTimetables> {
  offlineTimetablesPromise ??= import("./timetable.generated").then((module) => module.OFFLINE_TIMETABLES as OfflineTimetables);
  return offlineTimetablesPromise;
}

/** 未設定の乗換駅・路線ペアに使う保守的な既定値。 */
export const MINIMUM_TRANSFER_MINUTES = 6;

function transferConnectionKey(station: string, firstLineId: LineId, secondLineId: LineId) {
  return `${station}|${[firstLineId, secondLineId].sort().join("|")}`;
}

/**
 * 駅構内の動線差を表す、アプリ内の推奨最低乗換時間（分）。
 * 公式の共通乗換時間テーブルは公開確認できないため、構内移動・列車接続の余裕を
 * 考慮した初期値として管理し、後から駅ごとに更新できる構造にしている。
 */
export const TRANSFER_MINUTES_BY_CONNECTION: Readonly<Record<string, number>> = {
  [transferConnectionKey("金山", "meijo", "meiko")]: 2,
  [transferConnectionKey("平安通", "kamiida", "meijo")]: 3,
  [transferConnectionKey("伏見", "higashiyama", "tsurumai")]: 4,
  [transferConnectionKey("久屋大通", "meijo", "sakuradori")]: 4,
  [transferConnectionKey("本山", "higashiyama", "meijo")]: 4,
  [transferConnectionKey("丸の内", "sakuradori", "tsurumai")]: 4,
  [transferConnectionKey("八事", "meijo", "tsurumai")]: 4,
  [transferConnectionKey("栄", "higashiyama", "meijo")]: 5,
  [transferConnectionKey("今池", "higashiyama", "sakuradori")]: 5,
  [transferConnectionKey("上前津", "meijo", "tsurumai")]: 5,
  [transferConnectionKey("御器所", "sakuradori", "tsurumai")]: 5,
  [transferConnectionKey("新瑞橋", "meijo", "sakuradori")]: 5,
  [transferConnectionKey("名古屋", "higashiyama", "sakuradori")]: 7,
};

export function getTransferMinutes(station: string, fromLineId: LineId, toLineId: LineId) {
  if (fromLineId === toLineId) return 0;
  return TRANSFER_MINUTES_BY_CONNECTION[transferConnectionKey(station, fromLineId, toLineId)] ?? MINIMUM_TRANSFER_MINUTES;
}

export const SUBWAY_LINES: readonly SubwayLine[] = [
  {
    id: "higashiyama",
    name: "東山線",
    color: "#F5C400",
    textColor: "#17212B",
    stations: ["高畑", "八田", "岩塚", "中村公園", "中村日赤", "本陣", "亀島", "名古屋", "伏見", "栄", "新栄町", "千種", "今池", "池下", "覚王山", "本山", "東山公園", "星ヶ丘", "一社", "上社", "本郷", "藤が丘"],
    distances: [0.9, 1.1, 1.1, 0.8, 0.7, 0.9, 1.1, 1.4, 1.0, 1.1, 0.9, 0.7, 0.9, 0.6, 1.0, 0.9, 1.1, 1.3, 1.1, 0.7, 1.3],
    positiveDirectionLabel: "藤が丘方面",
    negativeDirectionLabel: "高畑方面",
  },
  {
    id: "meijo",
    name: "名城線",
    color: "#8E3A90",
    textColor: "#FFFFFF",
    loop: true,
    stations: ["金山", "東別院", "上前津", "矢場町", "栄", "久屋大通", "名古屋城", "名城公園", "黒川", "志賀本通", "平安通", "大曽根", "ナゴヤドーム前矢田", "砂田橋", "茶屋ヶ坂", "自由ヶ丘", "本山", "名古屋大学", "八事日赤", "八事", "総合リハビリセンター", "瑞穂運動場東", "新瑞橋", "妙音通", "堀田", "熱田神宮伝馬町", "熱田神宮西", "西高蔵"],
    distances: [0.7, 0.9, 0.7, 0.7, 0.4, 0.9, 1.1, 1.0, 1.0, 0.8, 0.7, 0.8, 0.9, 0.9, 1.2, 1.4, 1.0, 1.1, 1.0, 1.3, 1.0, 1.2, 0.7, 0.8, 1.2, 1.0, 0.9, 1.1],
    positiveDirectionLabel: "右回り",
    negativeDirectionLabel: "左回り",
  },
  {
    id: "meiko",
    name: "名港線",
    color: "#8E3A90",
    textColor: "#FFFFFF",
    stations: ["金山", "日比野", "六番町", "東海通", "港区役所", "築地口", "名古屋港"],
    distances: [1.5, 1.1, 1.2, 0.8, 0.8, 0.6],
    positiveDirectionLabel: "名古屋港方面",
    negativeDirectionLabel: "金山方面",
  },
  {
    id: "tsurumai",
    name: "鶴舞線",
    color: "#00A5D7",
    textColor: "#FFFFFF",
    stations: ["上小田井", "庄内緑地公園", "庄内通", "浄心", "浅間町", "丸の内", "伏見", "大須観音", "上前津", "鶴舞", "荒畑", "御器所", "川名", "いりなか", "八事", "塩釜口", "植田", "原", "平針", "赤池"],
    distances: [1.4, 1.3, 1.4, 0.8, 1.4, 0.7, 0.8, 1.0, 0.9, 1.3, 0.9, 1.2, 1.0, 0.9, 1.4, 1.2, 0.8, 0.9, 1.1],
    positiveDirectionLabel: "赤池方面",
    negativeDirectionLabel: "上小田井方面",
  },
  {
    id: "sakuradori",
    name: "桜通線",
    color: "#E24B3B",
    textColor: "#FFFFFF",
    stations: ["太閤通", "名古屋", "国際センター", "丸の内", "久屋大通", "高岳", "車道", "今池", "吹上", "御器所", "桜山", "瑞穂区役所", "瑞穂運動場西", "新瑞橋", "桜本町", "鶴里", "野並", "鳴子北", "相生山", "神沢", "徳重"],
    distances: [0.9, 0.7, 0.8, 0.9, 0.7, 1.3, 1.0, 1.1, 1.0, 1.1, 0.9, 0.7, 0.7, 1.1, 0.9, 1.1, 1.1, 0.9, 1.4, 0.8],
    positiveDirectionLabel: "徳重方面",
    negativeDirectionLabel: "太閤通方面",
  },
  {
    id: "kamiida",
    name: "上飯田線",
    color: "#F39BC4",
    textColor: "#17212B",
    stations: ["平安通", "上飯田"],
    distances: [0.8],
    positiveDirectionLabel: "上飯田・小牧・犬山方面",
    negativeDirectionLabel: "平安通方面",
  },
] as const;

export const ALL_STATIONS = Array.from(new Set(SUBWAY_LINES.flatMap((line) => line.stations))).sort((a, b) => a.localeCompare(b, "ja"));

const lineById = new Map<LineId, SubwayLine>(SUBWAY_LINES.map((line) => [line.id, line]));
const linesByStation = new Map<string, SubwayLine[]>();
for (const line of SUBWAY_LINES) {
  for (const station of line.stations) {
    linesByStation.set(station, [...(linesByStation.get(station) ?? []), line]);
  }
}

function timetableKey(lineId: LineId, station: string, direction: 1 | -1) {
  return `${lineId}|${station}|${direction}`;
}

function findNextDeparture(timetables: OfflineTimetables, lineId: LineId, station: string, direction: 1 | -1, readyAt: number, dayType: ServiceDayType): number | null {
  const schedule = timetables[timetableKey(lineId, station, direction)];
  if (!schedule) return null;
  const times = schedule[dayType] as readonly number[];
  return times.find((time) => time >= readyAt) ?? null;
}

function segmentTravelMinutes(distanceKm: number) {
  return Math.max(1, Math.round(distanceKm / 0.5));
}

function hourMinuteText(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60).toString().padStart(2, "0");
  const minute = (normalized % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatMinutes(minutes: number) {
  const dayOffset = Math.floor(minutes / 1440);
  return `${hourMinuteText(minutes)}${dayOffset > 0 ? `（翌日）` : ""}`;
}

export function minutesFromTimeText(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
}

export function getServiceDayType(date: Date): ServiceDayType {
  const day = date.getDay();
  return day === 0 || day === 6 ? "holiday" : "weekday";
}

function calculateFare(distanceKm: number) {
  const roundedKm = Math.ceil(distanceKm);
  if (roundedKm <= 3) return 210;
  if (roundedKm <= 7) return 240;
  if (roundedKm <= 11) return 270;
  if (roundedKm <= 15) return 310;
  return 340;
}

function stateKey(station: string, lineId: LineId | null) {
  return `${station}::${lineId ?? "origin"}`;
}

type SearchState = {
  station: string;
  lineId: LineId | null;
  arrivalMinutes: number;
  legs: RouteLeg[];
};

function possibleAlightStations(line: SubwayLine, station: string, direction: 1 | -1) {
  const startIndex = line.stations.indexOf(station);
  if (startIndex < 0) return [];
  const options: { station: string; rideMinutes: number; distanceKm: number }[] = [];
  let rideMinutes = 0;
  let distanceKm = 0;
  const maximumStops = line.loop ? line.stations.length - 1 : line.stations.length - 1;
  for (let offset = 1; offset <= maximumStops; offset += 1) {
    const rawSegmentIndex = direction === 1 ? startIndex + offset - 1 : startIndex - offset;
    if (!line.loop && (rawSegmentIndex < 0 || rawSegmentIndex >= line.distances.length)) break;
    const segmentIndex = ((rawSegmentIndex % line.distances.length) + line.distances.length) % line.distances.length;
    const stationIndex = ((startIndex + direction * offset) % line.stations.length + line.stations.length) % line.stations.length;
    const segmentDistance = line.distances[segmentIndex];
    distanceKm += segmentDistance;
    rideMinutes += segmentTravelMinutes(segmentDistance);
    options.push({ station: line.stations[stationIndex], rideMinutes, distanceKm });
    if (!line.loop && (stationIndex === 0 || stationIndex === line.stations.length - 1)) break;
  }
  return options;
}

function stationPassageMinutes(timetables: OfflineTimetables, line: SubwayLine, station: string, direction: 1 | -1, afterMinutes: number, fallbackMinutes: number, dayType: ServiceDayType) {
  return findNextDeparture(timetables, line.id, station, direction, afterMinutes, dayType) ?? fallbackMinutes;
}

function findTimedRouteFromTimetables(timetables: OfflineTimetables, {
  origin,
  destination,
  departureMinutes,
  dayType,
}: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
}): TimedRoute | null {
  if (!origin || !destination || origin === destination || !linesByStation.has(origin) || !linesByStation.has(destination)) {
    return null;
  }

  const initial: SearchState = { station: origin, lineId: null, arrivalMinutes: departureMinutes, legs: [] };
  const queue: SearchState[] = [initial];
  const bestArrival = new Map<string, number>([[stateKey(origin, null), departureMinutes]]);
  let bestResult: SearchState | null = null;

  while (queue.length > 0) {
    queue.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes);
    const current = queue.shift();
    if (!current) break;
    if (bestResult && current.arrivalMinutes >= bestResult.arrivalMinutes) continue;
    if (current.station === destination && current.legs.length > 0) {
      bestResult = current;
      continue;
    }

    for (const candidateLine of linesByStation.get(current.station) ?? []) {
      const isTransfer = current.lineId !== null && current.lineId !== candidateLine.id;
      const transferMinutes = isTransfer && current.lineId ? getTransferMinutes(current.station, current.lineId, candidateLine.id) : 0;
      const readyAt = current.arrivalMinutes + transferMinutes;
      for (const direction of [1, -1] as const) {
        const departure = findNextDeparture(timetables, candidateLine.id, current.station, direction, readyAt, dayType);
        if (departure === null) continue;
        for (const target of possibleAlightStations(candidateLine, current.station, direction)) {
          const estimatedPassage = departure + target.rideMinutes;
          const arrival = stationPassageMinutes(timetables, candidateLine, target.station, direction, estimatedPassage, estimatedPassage, dayType);
          const leg: RouteLeg = {
            lineId: candidateLine.id,
            lineName: candidateLine.name,
            lineColor: candidateLine.color,
            textColor: candidateLine.textColor,
            directionLabel: direction === 1 ? candidateLine.positiveDirectionLabel : candidateLine.negativeDirectionLabel,
            boardStation: current.station,
            alightStation: target.station,
            departureMinutes: departure,
            arrivalMinutes: arrival,
            waitMinutes: Math.max(0, departure - current.arrivalMinutes),
            transferMinutes,
            rideMinutes: Math.max(0, arrival - departure),
            distanceKm: target.distanceKm,
          };
          const key = stateKey(target.station, candidateLine.id);
          const knownArrival = bestArrival.get(key);
          if (knownArrival !== undefined && knownArrival <= arrival) continue;
          bestArrival.set(key, arrival);
          queue.push({ station: target.station, lineId: candidateLine.id, arrivalMinutes: arrival, legs: [...current.legs, leg] });
        }
      }
    }
  }

  if (!bestResult) return null;
  const distanceKm = bestResult.legs.reduce((total, leg) => total + leg.distanceKm, 0);
  const transferCount = bestResult.legs.slice(1).filter((leg, index) => leg.lineId !== bestResult?.legs[index].lineId).length;
  return {
    origin,
    destination,
    requestedDepartureMinutes: departureMinutes,
    actualDepartureMinutes: bestResult.legs[0].departureMinutes,
    arrivalMinutes: bestResult.arrivalMinutes,
    totalMinutes: bestResult.arrivalMinutes - departureMinutes,
    transferCount,
    fare: calculateFare(distanceKm),
    distanceKm,
    legs: bestResult.legs,
  };
}

export async function findTimedRoute(params: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
}): Promise<TimedRoute | null> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return null;
  }
  return findTimedRouteFromTimetables(await loadOfflineTimetables(), params);
}

export function getLine(lineId: LineId) {
  return lineById.get(lineId);
}

/** 出発マーカーなどで使う、駅に乗り入れる路線。経路が確定している場合はその路線を優先する。 */
export function getLineForStation(station: string, preferredLineId?: LineId) {
  const lines = linesByStation.get(station) ?? [];
  return lines.find((line) => line.id === preferredLineId) ?? lines[0];
}
