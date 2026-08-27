import { japaneseHolidayName, isJapaneseHoliday } from "./holidays";
import { TIMETABLE_REVISIONS, type OfflineTimetables } from "./timetable-meta";
import type { LineId, RouteLeg, RoutePreference, ServiceDayType, SubwayLine, TimedRoute } from "./types";

export { TIMETABLE_REVISIONS, japaneseHolidayName };

let offlineTimetablesPromise: Promise<Record<string, OfflineTimetables[string]>> | undefined;

/**
 * 駅・路線の選択画面を軽量に保つため、巨大な時刻表本体は検索が実行された時点でのみ読み込む。
 * 読み込み後は同じPromiseを共有するため、以後の検索はオフラインのメモリ内データを利用する。
 * 戻り値は可変オブジェクト（`loadBusNetwork`がバスの時刻表をここに追記するため）。
 */
async function loadOfflineTimetables(): Promise<Record<string, OfflineTimetables[string]>> {
  offlineTimetablesPromise ??= import("./timetable.generated").then((module) => ({ ...(module.OFFLINE_TIMETABLES as OfflineTimetables) }));
  return offlineTimetablesPromise;
}

/**
 * 未設定の乗換駅・路線ペアに使う保守的な既定値。
 * 現在は2路線が乗り入れる乗換駅13駅すべてに`TRANSFER_MINUTES_BY_CONNECTION`で個別の値を設定済みのため、
 * 実際の検索でこの既定値が使われることは無い(テスト「乗換駅・路線ペアごとの乗換時間を対称に参照し、
 * 未設定値には既定値を使う」で参照可能性自体は担保しつつ、「全乗換駅が個別設定済みであること」も
 * 別途テストで検証している)。将来、駅を跨いで3路線目が乗り入れる駅が増えた場合などに備えて残している。
 */
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
  // 金山(名城線⇔名港線)・平安通(上飯田線⇔名城線)はいずれも同一ホームでの対面乗換のため、他より短い3分とする。
  [transferConnectionKey("金山", "meijo", "meiko")]: 3,
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
  // 徒歩連絡（駅名が異なる乗換駅同士を結ぶ仮想区間）自体が「乗換にかかる時間」を表すため、
  // その前後で通常の乗換ペナルティ(既定6分)を重ねて加算しない。
  if (fromLineId.startsWith("meitetsu_walk_") || toLineId.startsWith("meitetsu_walk_")) return 0;
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

/** 駅名のひらがな読み。かな入力での予測変換に使う。 */
export const STATION_READINGS: Readonly<Record<string, string>> = {
  "高畑": "たかばた",
  "八田": "はった",
  "岩塚": "いわつか",
  "中村公園": "なかむらこうえん",
  "中村日赤": "なかむらにっせき",
  "本陣": "ほんじん",
  "亀島": "かめじま",
  "名古屋": "なごや",
  "伏見": "ふしみ",
  "栄": "さかえ",
  "新栄町": "しんさかえまち",
  "千種": "ちくさ",
  "今池": "いまいけ",
  "池下": "いけした",
  "覚王山": "かくおうざん",
  "本山": "もとやま",
  "東山公園": "ひがしやまこうえん",
  "星ヶ丘": "ほしがおか",
  "一社": "いっしゃ",
  "上社": "かみやしろ",
  "本郷": "ほんごう",
  "藤が丘": "ふじがおか",
  "金山": "かなやま",
  "東別院": "ひがしべついん",
  "上前津": "かみまえづ",
  "矢場町": "やばちょう",
  "久屋大通": "ひさやおおどおり",
  "名古屋城": "なごやじょう",
  "名城公園": "めいじょうこうえん",
  "黒川": "くろかわ",
  "志賀本通": "しがほんどおり",
  "平安通": "へいあんどおり",
  "大曽根": "おおぞね",
  "ナゴヤドーム前矢田": "なごやどーむまえやだ",
  "砂田橋": "すなだばし",
  "茶屋ヶ坂": "ちゃやがさか",
  "自由ヶ丘": "じゆうがおか",
  "名古屋大学": "なごやだいがく",
  "八事日赤": "やごとにっせき",
  "八事": "やごと",
  "総合リハビリセンター": "そうごうりはびりせんたー",
  "瑞穂運動場東": "みずほうんどうじょうひがし",
  "新瑞橋": "あらたまばし",
  "妙音通": "みょうおんどおり",
  "堀田": "ほりた",
  "熱田神宮伝馬町": "あつたじんぐうてんまちょう",
  "熱田神宮西": "あつたじんぐうにし",
  "西高蔵": "にしたかくら",
  "日比野": "ひびの",
  "六番町": "ろくばんちょう",
  "東海通": "とうかいどおり",
  "港区役所": "みなとくやくしょ",
  "築地口": "つきじぐち",
  "名古屋港": "なごやこう",
  "上小田井": "かみおたい",
  "庄内緑地公園": "しょうないりょくちこうえん",
  "庄内通": "しょうないどおり",
  "浄心": "じょうしん",
  "浅間町": "せんげんちょう",
  "丸の内": "まるのうち",
  "大須観音": "おおすかんのん",
  "鶴舞": "つるまい",
  "荒畑": "あらはた",
  "御器所": "ごきそ",
  "川名": "かわな",
  "いりなか": "いりなか",
  "塩釜口": "しおがまぐち",
  "植田": "うえだ",
  "原": "はら",
  "平針": "ひらばり",
  "赤池": "あかいけ",
  "太閤通": "たいこうどおり",
  "国際センター": "こくさいせんたー",
  "高岳": "たかおか",
  "車道": "くるまみち",
  "吹上": "ふきあげ",
  "桜山": "さくらやま",
  "瑞穂区役所": "みずほくやくしょ",
  "瑞穂運動場西": "みずほうんどうじょうにし",
  "桜本町": "さくらほんまち",
  "鶴里": "つるさと",
  "野並": "のなみ",
  "鳴子北": "なるこきた",
  "相生山": "あいおいやま",
  "神沢": "かみさわ",
  "徳重": "とくしげ",
  "上飯田": "かみいいだ",
};

const lineById = new Map<LineId, SubwayLine>(SUBWAY_LINES.map((line) => [line.id, line]));
const linesByStation = new Map<string, SubwayLine[]>();
for (const line of SUBWAY_LINES) {
  for (const station of line.stations) {
    linesByStation.set(station, [...(linesByStation.get(station) ?? []), line]);
  }
}
// バス統合後は駅数が動的に増えるため、ALL_STATIONS相当の一覧はこの可変配列で管理する。
let allStationsCache = ALL_STATIONS;
function recomputeAllStations() {
  allStationsCache = [...new Set([...linesByStation.keys()])].sort((a, b) => a.localeCompare(b, "ja"));
}

type ExternalLineJson = { id: string; name: string; stations: string[]; distances: number[] };

/**
 * 地下鉄以外の交通ネットワーク（バス・名鉄）を実行時に取得し、
 * 検索インデックス（路線マップ・時刻表）に追記する共通処理。
 * バンドルサイズを抑えるため、地下鉄と違いビルド時にはバンドルせず`public/<urlBase>/`から`fetch`する
 * （初回検索がまだ通信していない場合は失敗しうるため、`preloadOfflineTimetables`と同様に
 *  アイドル時間の先読みを呼び出し側で行う想定）。
 * 駅の同一性は駅名（文字列）で判定する既存の設計を踏襲しているため、たまたま同名の
 * 停留所・駅が別々の実在地点であっても同一ノードとして扱われる制約がある。
 */
async function loadExternalNetwork(urlBase: string, lineColor: string): Promise<void> {
  if (typeof fetch === "undefined") return;
  const [externalLines, externalTimetables, timetables] = await Promise.all([
    fetch(`/${urlBase}/lines.generated.json`).then((r) => r.json() as Promise<ExternalLineJson[]>),
    fetch(`/${urlBase}/timetable.generated.json`).then((r) => r.json() as Promise<Record<string, OfflineTimetables[string]>>),
    loadOfflineTimetables(),
  ]);
  for (const externalLine of externalLines) {
    const line: SubwayLine = {
      id: externalLine.id,
      name: externalLine.name,
      color: lineColor,
      textColor: "#FFFFFF",
      stations: externalLine.stations,
      distances: externalLine.distances,
      positiveDirectionLabel: `${externalLine.stations[externalLine.stations.length - 1]}方面`,
      negativeDirectionLabel: `${externalLine.stations[0]}方面`,
    };
    lineById.set(line.id, line);
    for (const station of line.stations) {
      linesByStation.set(station, [...(linesByStation.get(station) ?? []), line]);
    }
  }
  Object.assign(timetables, externalTimetables);
  recomputeAllStations();
}

let busNetworkPromise: Promise<void> | undefined;
const BUS_LINE_COLOR = "#2E9E5B";

/** 名古屋市バスのGTFS-JPから生成した実データ（駅×方向×平日/休日の発車時刻）を取り込む。 */
export function loadBusNetwork(): Promise<void> {
  busNetworkPromise ??= loadExternalNetwork("bus", BUS_LINE_COLOR);
  return busNetworkPromise;
}

let meitetsuNetworkPromise: Promise<void> | undefined;
const MEITETSU_LINE_COLOR = "#C4001F";

/**
 * 名鉄（名古屋本線・犬山線・常滑線）を取り込む。名鉄には公式時刻表オープンデータが無いため、
 * バスと異なり実データではなく「距離÷想定表定速度」の概算所要時間と、一定間隔運行と
 * 仮定した合成ダイヤ（平日/休日とも同一）を使っている。詳細は変換元スクリプトのコメント参照。
 */
export function loadMeitetsuNetwork(): Promise<void> {
  meitetsuNetworkPromise ??= loadExternalNetwork("meitetsu", MEITETSU_LINE_COLOR);
  return meitetsuNetworkPromise;
}

export function isBusLine(lineId: LineId) {
  return lineId.startsWith("bus_");
}

export function isMeitetsuLine(lineId: LineId) {
  return lineId.startsWith("meitetsu_");
}

/** 駅名が異なる乗換駅同士（例: 名古屋⇔名鉄名古屋）を結ぶ、徒歩連絡専用の仮想路線かどうか。 */
export function isWalkConnector(lineId: LineId) {
  return lineId.startsWith("meitetsu_walk_");
}

/** 駅選択で使う、指定路線の駅一覧。全路線指定時は五十音順の全駅を返す。 */
export function getStationsForLine(lineId: LineId | "all") {
  return lineId === "all" ? allStationsCache : lineById.get(lineId)?.stations ?? [];
}

/** カタカナをひらがなに変換する。読みがな入力の予測変換で表記を揃えるために使う。 */
export function toHiragana(text: string) {
  return text.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * 駅名検索で、入力途中の漢字・ひらがな・カタカナのいずれでも候補に出るようにする。
 * 駅名そのものへの部分一致に加え、読みがな(STATION_READINGS)への部分一致も許可する。
 */
export function matchesStationQuery(station: string, query: string) {
  if (!query) return true;
  const normalizedQuery = query.toLocaleLowerCase("ja");
  if (station.toLocaleLowerCase("ja").includes(normalizedQuery)) return true;
  // 読みがなは前方一致のみ許可する。部分一致だと短い入力(例:「せ」)が
  // 無関係な駅の読みの途中(例:総合リハビリセンター＝そうごうりはびり「せんたー」)に
  // ヒットしてしまうため。
  const reading = STATION_READINGS[station];
  return reading ? reading.startsWith(toHiragana(normalizedQuery)) : false;
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

/** 指定駅から出ている実在の便(全路線・全方向)の発車時刻を、重複を除いて集める。到着時刻指定の検索で使う。 */
function collectDepartureCandidates(timetables: OfflineTimetables, station: string, dayType: ServiceDayType): number[] {
  const candidates = new Set<number>();
  for (const line of linesByStation.get(station) ?? []) {
    for (const direction of [1, -1] as const) {
      const schedule = timetables[timetableKey(line.id, station, direction)];
      if (!schedule) continue;
      for (const time of schedule[dayType] as readonly number[]) {
        candidates.add(time);
      }
    }
  }
  // 遅い順。到着時刻指定では「間に合う一番遅い出発」を先頭から見つけたいため。
  return [...candidates].sort((a, b) => b - a);
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
  return day === 0 || day === 6 || isJapaneseHoliday(date) ? "holiday" : "weekday";
}

/** 0.1km単位に丸めてから切り上げる。複数区間の距離を積算すると浮動小数点誤差が乗るため。 */
function roundDistanceKm(distanceKm: number) {
  return Math.ceil(Math.round(distanceKm * 10) / 10);
}

function calculateSubwayFare(distanceKm: number) {
  const roundedKm = roundDistanceKm(distanceKm);
  if (roundedKm <= 3) return 210;
  if (roundedKm <= 7) return 240;
  if (roundedKm <= 11) return 270;
  if (roundedKm <= 15) return 310;
  return 340;
}

/** 名古屋市バスの大人普通運賃（均一210円・1乗車ごと）。2026年時点。 */
const NAGOYA_BUS_FARE = 210;

/**
 * 名鉄の大人普通旅客運賃（対キロ区間制、2024年3月16日改定後）。
 * 出典: 名鉄ニュースリリース(2023-09-01)・第三者集計の運賃早見表で初乗り(180円)・
 * 65～68km区間(1,270円、名鉄名古屋～豊橋間の公表値)と整合を確認済み。
 * 実際の名鉄運賃計算には特定区間の特殊運賃・加算運賃(空港線等)があり、
 * ここでは営業キロのみに基づく本則運賃として概算している。
 */
const MEITETSU_FARE_TABLE: readonly { maxKm: number; fare: number }[] = [
  { maxKm: 3, fare: 180 }, { maxKm: 4, fare: 210 }, { maxKm: 7, fare: 250 }, { maxKm: 8, fare: 270 },
  { maxKm: 12, fare: 330 }, { maxKm: 16, fare: 400 }, { maxKm: 20, fare: 460 }, { maxKm: 24, fare: 510 },
  { maxKm: 28, fare: 570 }, { maxKm: 32, fare: 630 }, { maxKm: 36, fare: 690 }, { maxKm: 40, fare: 750 },
  { maxKm: 44, fare: 830 }, { maxKm: 48, fare: 900 }, { maxKm: 52, fare: 980 }, { maxKm: 56, fare: 1050 },
  { maxKm: 60, fare: 1120 }, { maxKm: 64, fare: 1190 }, { maxKm: 68, fare: 1270 }, { maxKm: 72, fare: 1320 },
  { maxKm: 76, fare: 1380 }, { maxKm: 80, fare: 1430 }, { maxKm: 85, fare: 1500 }, { maxKm: 90, fare: 1550 },
  { maxKm: 95, fare: 1610 }, { maxKm: 100, fare: 1670 }, { maxKm: 110, fare: 1760 }, { maxKm: 120, fare: 1860 },
  { maxKm: 130, fare: 1950 }, { maxKm: 143, fare: 2050 },
];

function calculateMeitetsuFare(distanceKm: number) {
  const roundedKm = roundDistanceKm(distanceKm);
  const tier = MEITETSU_FARE_TABLE.find((t) => roundedKm <= t.maxKm);
  return tier ? tier.fare : MEITETSU_FARE_TABLE[MEITETSU_FARE_TABLE.length - 1].fare;
}

type FareOperator = "subway" | "bus" | "meitetsu";

function fareOperatorForLine(lineId: LineId): FareOperator | null {
  if (isWalkConnector(lineId)) return null; // 徒歩連絡は運賃対象外
  if (isBusLine(lineId)) return "bus";
  if (isMeitetsuLine(lineId)) return "meitetsu";
  return "subway";
}

/**
 * manaca乗継割引: 地下鉄⇔市バス・市バス⇔市バスを90分以内に乗り継いだ場合、
 * 2乗車目以降の運賃から1回の乗継につき80円引く。
 * 出典: 名古屋市交通局の乗継割引案内（対象は地下鉄・市バス間のみ）。
 * 名鉄の乗継割引は名鉄電車⇔名鉄バスの組み合わせのみが対象で、地下鉄・市バスとは
 * 提携していないため、名鉄が絡む乗継はこの割引の対象外とする。
 */
const TRANSFER_DISCOUNT_YEN = 80;
const TRANSFER_DISCOUNT_WINDOW_MINUTES = 90;

/**
 * 名鉄には知多新線・豊田線・羽島線・空港線の4路線に加算運賃が設定されているが、
 * 本アプリが収録する名古屋本線・犬山線・常滑線はいずれも対象外のため未対応
 * （2025年8月時点の名鉄公表資料で確認済み。対象路線を追加収録する場合は要対応）。
 */

/**
 * 経路全体の運賃を、乗車した会社(地下鉄/名鉄/バス)ごとに分けて計算し合算する。
 * バスは乗車ごとに均一210円、地下鉄・名鉄はその会社区間の合計距離に対する対キロ運賃。
 * 地下鉄⇔バス・バス⇔バスの乗継にはmanaca乗継割引(90分以内・1回80円引き)を適用する。
 * 徒歩連絡区間（同名でない乗換駅を結ぶ仮想区間）は運賃計算から除外する。
 */
function calculateFare(legs: readonly RouteLeg[]) {
  const billedLegs = legs
    .map((leg) => ({ leg, operator: fareOperatorForLine(leg.lineId) }))
    .filter((entry): entry is { leg: RouteLeg; operator: FareOperator } => entry.operator !== null);

  let total = 0;
  let subwayKm = 0;
  let meitetsuKm = 0;
  let transferDiscountCount = 0;

  billedLegs.forEach(({ leg, operator }, index) => {
    if (operator === "bus") total += NAGOYA_BUS_FARE;
    else if (operator === "meitetsu") meitetsuKm += leg.distanceKm;
    else subwayKm += leg.distanceKm;

    if (index === 0) return;
    const previous = billedLegs[index - 1];
    // 地下鉄の路線を跨いでも改札を出ない限りは同一乗車(運賃継続)なので新たな乗車とみなさない。
    // バスは路線が変わるたび必ず乗り直しになるため、常に新たな乗車として扱う。
    const isNewBoarding = operator === "bus" || previous.operator !== operator;
    const eligibleForDiscount = (operator === "bus" || operator === "subway") && (previous.operator === "bus" || previous.operator === "subway");
    if (isNewBoarding && eligibleForDiscount) {
      const gapMinutes = leg.departureMinutes - previous.leg.arrivalMinutes;
      if (gapMinutes <= TRANSFER_DISCOUNT_WINDOW_MINUTES) transferDiscountCount += 1;
    }
  });

  if (subwayKm > 0) total += calculateSubwayFare(subwayKm);
  if (meitetsuKm > 0) total += calculateMeitetsuFare(meitetsuKm);
  total -= transferDiscountCount * TRANSFER_DISCOUNT_YEN;
  return Math.max(0, total);
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

type SearchScore = {
  arrivalMinutes: number;
  transferCount: number;
};

function transferCountForLegs(legs: readonly RouteLeg[]) {
  return legs.slice(1).filter((leg, index) => leg.lineId !== legs[index]?.lineId).length;
}

/**
 * 探索の途中経過として同一路線・同一方向の区間が連続して確定することがある(実際に乗換した
 * わけではなく、時刻表の精度を上げるために内部的に途中駅で一旦区切っただけ)。利用者には
 * 1本の乗車として見せるため、隣接する同一路線の区間はここでまとめる。
 */
function mergeConsecutiveSameLineLegs(legs: readonly RouteLeg[]): RouteLeg[] {
  const merged: RouteLeg[] = [];
  for (const leg of legs) {
    const previous = merged[merged.length - 1];
    if (previous && previous.lineId === leg.lineId) {
      merged[merged.length - 1] = {
        ...previous,
        alightStation: leg.alightStation,
        arrivalMinutes: leg.arrivalMinutes,
        rideMinutes: Math.max(0, leg.arrivalMinutes - previous.departureMinutes),
        distanceKm: previous.distanceKm + leg.distanceKm,
      };
    } else {
      merged.push(leg);
    }
  }
  return merged;
}

function scoreForState(state: SearchState): SearchScore {
  return { arrivalMinutes: state.arrivalMinutes, transferCount: transferCountForLegs(state.legs) };
}

/**
 * 最短は到着時刻を、乗換少なめは乗換回数を第一基準にする。両者の同点はもう一方の値で解消し、
 * 結果を常に決定的にする。
 */
function compareScores(left: SearchScore, right: SearchScore, preference: RoutePreference) {
  if (preference === "fewestTransfers") {
    return left.transferCount - right.transferCount || left.arrivalMinutes - right.arrivalMinutes;
  }
  return left.arrivalMinutes - right.arrivalMinutes || left.transferCount - right.transferCount;
}

function possibleAlightStations(line: SubwayLine, station: string, direction: 1 | -1) {
  const startIndex = line.stations.indexOf(station);
  if (startIndex < 0) return [];
  const options: { station: string; rideMinutes: number; distanceKm: number }[] = [];
  let rideMinutes = 0;
  let distanceKm = 0;
  const maximumStops = line.stations.length - 1;
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
  preference = "fastest",
}: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
  preference?: RoutePreference;
}, excludedTransferStations?: ReadonlySet<string>): TimedRoute | null {
  if (!origin || !destination || origin === destination || !linesByStation.has(origin) || !linesByStation.has(destination)) {
    return null;
  }

  const initial: SearchState = { station: origin, lineId: null, arrivalMinutes: departureMinutes, legs: [] };
  const queue: SearchState[] = [initial];
  const bestScore = new Map<string, SearchScore>([[stateKey(origin, null), scoreForState(initial)]]);
  let bestResult: SearchState | null = null;

  while (queue.length > 0) {
    queue.sort((a, b) => compareScores(scoreForState(a), scoreForState(b), preference));
    const current = queue.shift();
    if (!current) break;
    if (bestResult && compareScores(scoreForState(current), scoreForState(bestResult), preference) >= 0) continue;
    if (current.station === destination && current.legs.length > 0) {
      bestResult = current;
      continue;
    }

    for (const candidateLine of linesByStation.get(current.station) ?? []) {
      const isTransfer = current.lineId !== null && current.lineId !== candidateLine.id;
      if (isTransfer && excludedTransferStations?.has(current.station)) continue;
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
          const nextState: SearchState = { station: target.station, lineId: candidateLine.id, arrivalMinutes: arrival, legs: [...current.legs, leg] };
          const nextScore = scoreForState(nextState);
          const knownScore = bestScore.get(key);
          if (knownScore && compareScores(knownScore, nextScore, preference) <= 0) continue;
          bestScore.set(key, nextScore);
          queue.push(nextState);
        }
      }
    }
  }

  if (!bestResult) return null;
  const legs = mergeConsecutiveSameLineLegs(bestResult.legs);
  const distanceKm = legs.reduce((total, leg) => total + leg.distanceKm, 0);
  const transferCount = transferCountForLegs(legs);
  return {
    origin,
    destination,
    requestedDepartureMinutes: departureMinutes,
    actualDepartureMinutes: legs[0].departureMinutes,
    arrivalMinutes: bestResult.arrivalMinutes,
    totalMinutes: bestResult.arrivalMinutes - departureMinutes,
    transferCount,
    fare: calculateFare(legs),
    distanceKm,
    legs,
  };
}

/**
 * 到着時刻を起点に経路を探す。出発時刻をずらして何度も前向き探索(`findTimedRouteFromTimetables`)を
 * やり直すのではなく、出発駅の実在する発車時刻(全路線・全方向)だけを候補にして絞り込む。
 * 発車時刻の候補は2つの発車時刻の間であれば結果が変わらない(前向き探索は「次の実在の発車」に
 * 丸め込むため)ため、実在する発車時刻だけを試せば取りこぼしがない。
 *
 * 手作りの逆向き探索(区間ごとに乗車・降車の時刻表を個別に読み解いて組み立てる方式)も実装したが、
 * 区間所要時間があくまで概算であるため、乗換を挟む経路で前向き探索と結果が食い違う(到着時刻を
 * 実際より遅く見積もる、最遅の出発を取り逃す)ケースが実データで見つかった。既存の前向き探索は
 * 経路探索テスト・広域クロスチェックの両方で検証済みのため、到着時刻指定でも最終的な経路の組み立ては
 * 必ず前向き探索に委ね、探索範囲を絞り込む用途に徹することで、両者が常に一致するようにしている。
 */
function findTimedRouteByArrivalFromTimetables(timetables: OfflineTimetables, {
  origin,
  destination,
  arrivalByMinutes,
  dayType,
  preference = "fastest",
}: {
  origin: string;
  destination: string;
  arrivalByMinutes: number;
  dayType: ServiceDayType;
  preference?: RoutePreference;
}, excludedTransferStations?: ReadonlySet<string>): TimedRoute | null {
  if (!origin || !destination || origin === destination || !linesByStation.has(origin) || !linesByStation.has(destination)) {
    return null;
  }

  const candidates = collectDepartureCandidates(timetables, origin, dayType).filter((time) => time <= arrivalByMinutes);
  let best: TimedRoute | null = null;
  for (const departureMinutes of candidates) {
    const route = findTimedRouteFromTimetables(timetables, { origin, destination, departureMinutes, dayType, preference }, excludedTransferStations);
    if (!route || route.arrivalMinutes > arrivalByMinutes) continue;
    if (!best) {
      best = route;
      // 候補は出発時刻の遅い順に並んでいるため、「最短(到着優先)」ではここで見つかった時点で
      // それ以上遅い出発は存在しない=最適が確定しており、以降を調べても更新され得ない。
      if (preference !== "fewestTransfers") break;
      continue;
    }
    const better = preference === "fewestTransfers"
      ? route.transferCount < best.transferCount
        || (route.transferCount === best.transferCount && route.actualDepartureMinutes > best.actualDepartureMinutes)
      : route.actualDepartureMinutes > best.actualDepartureMinutes;
    if (better) best = route;
  }
  return best;
}

export async function findTimedRoute(params: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
  preference?: RoutePreference;
}): Promise<TimedRoute | null> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return null;
  }
  return findTimedRouteFromTimetables(await loadOfflineTimetables(), params);
}

/** 同一条件で「最短」と「乗換少なめ」を並べて提示するための経路ペア。 */
export async function findTimedRouteOptions(params: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
}): Promise<Record<RoutePreference, TimedRoute | null>> {
  const timetables = await loadOfflineTimetables();
  return {
    fastest: findTimedRouteFromTimetables(timetables, { ...params, preference: "fastest" }),
    fewestTransfers: findTimedRouteFromTimetables(timetables, { ...params, preference: "fewestTransfers" }),
  };
}

/** 到着時刻を指定して、それまでに着く経路をさかのぼって探す版の `findTimedRoute`。 */
export async function findTimedRouteByArrival(params: {
  origin: string;
  destination: string;
  arrivalByMinutes: number;
  dayType: ServiceDayType;
  preference?: RoutePreference;
}): Promise<TimedRoute | null> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return null;
  }
  return findTimedRouteByArrivalFromTimetables(await loadOfflineTimetables(), params);
}

/** 到着時刻を指定した場合の「最短(=一番遅く出発できる)」「乗換少なめ」の比較ペア。 */
export async function findTimedRouteByArrivalOptions(params: {
  origin: string;
  destination: string;
  arrivalByMinutes: number;
  dayType: ServiceDayType;
}): Promise<Record<RoutePreference, TimedRoute | null>> {
  const timetables = await loadOfflineTimetables();
  return {
    fastest: findTimedRouteByArrivalFromTimetables(timetables, { ...params, preference: "fastest" }),
    fewestTransfers: findTimedRouteByArrivalFromTimetables(timetables, { ...params, preference: "fewestTransfers" }),
  };
}

/**
 * 到着時刻検索の画面表示に必要な「最短」「乗換少なめ」「乗換駅違いの代替」を1回の呼び出しでまとめて求める。
 * `findDepartureRouteResults` の到着時刻版。ここでも「最短」の探索結果を使い回し、二重探索を避ける。
 */
export async function findArrivalRouteResults(params: {
  origin: string;
  destination: string;
  arrivalByMinutes: number;
  dayType: ServiceDayType;
}): Promise<{ options: Record<RoutePreference, TimedRoute | null>; transferAlternatives: TimedRoute[] }> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return { options: { fastest: null, fewestTransfers: null }, transferAlternatives: [] };
  }
  const timetables = await loadOfflineTimetables();
  const fastest = findTimedRouteByArrivalFromTimetables(timetables, { ...params, preference: "fastest" });
  const fewestTransfers = findTimedRouteByArrivalFromTimetables(timetables, { ...params, preference: "fewestTransfers" });
  const transferAlternatives = findArrivalTransferAlternativesFromTimetables(timetables, params, fastest);
  return { options: { fastest, fewestTransfers }, transferAlternatives };
}

function transferStationsOf(route: TimedRoute) {
  return new Set(route.legs.slice(1).map((leg) => leg.boardStation));
}

function sameTransferStations(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((station) => b.has(station));
}

/**
 * 同じ出発・到着駅でも、経由する乗換駅が異なる候補が存在する場合にそれを提示する。
 * 最速経路が使う乗換駅を除外して再探索し、別の乗換駅を通る経路が見つかれば
 * 到着時刻順に最大2件を返す。直通・代替が見つからない場合は1件のみ返す。
 */
function findTransferAlternativesFromTimetables(
  timetables: OfflineTimetables,
  params: {
    origin: string;
    destination: string;
    departureMinutes: number;
    dayType: ServiceDayType;
  },
  // 呼び出し元(findDepartureRouteResults)がすでに「最短」を探索済みなら渡してもらい、
  // 同じ探索をもう一度走らせないようにする。単独呼び出し(findTransferAlternatives)では省略時に自前で探索する。
  primary: TimedRoute | null = findTimedRouteFromTimetables(timetables, { ...params, preference: "fastest" }),
): TimedRoute[] {
  if (!primary || primary.legs.length <= 1) return primary ? [primary] : [];

  const usedTransferStations = transferStationsOf(primary);
  const alternative = findTimedRouteFromTimetables(timetables, { ...params, preference: "fastest" }, usedTransferStations);
  if (!alternative || alternative.legs.length === 0) return [primary];

  const alternativeTransferStations = transferStationsOf(alternative);
  if (sameTransferStations(usedTransferStations, alternativeTransferStations)) return [primary];

  return [primary, alternative].sort((a, b) => a.arrivalMinutes - b.arrivalMinutes);
}

export async function findTransferAlternatives(params: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
}): Promise<TimedRoute[]> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return [];
  }
  return findTransferAlternativesFromTimetables(await loadOfflineTimetables(), params);
}

/**
 * 到着時刻指定版の「乗換駅違いルート比較」。出発時刻版(`findTransferAlternativesFromTimetables`)と同じく、
 * 主経路が使う乗換駅を除外して再探索し、別の乗換駅を通る経路が見つかれば到着時刻順に最大2件を返す。
 */
function findArrivalTransferAlternativesFromTimetables(
  timetables: OfflineTimetables,
  params: {
    origin: string;
    destination: string;
    arrivalByMinutes: number;
    dayType: ServiceDayType;
  },
  primary: TimedRoute | null = findTimedRouteByArrivalFromTimetables(timetables, { ...params, preference: "fastest" }),
): TimedRoute[] {
  if (!primary || primary.legs.length <= 1) return primary ? [primary] : [];

  const usedTransferStations = transferStationsOf(primary);
  const alternative = findTimedRouteByArrivalFromTimetables(timetables, { ...params, preference: "fastest" }, usedTransferStations);
  if (!alternative || alternative.legs.length === 0) return [primary];

  const alternativeTransferStations = transferStationsOf(alternative);
  if (sameTransferStations(usedTransferStations, alternativeTransferStations)) return [primary];

  return [primary, alternative].sort((a, b) => a.arrivalMinutes - b.arrivalMinutes);
}

export async function findArrivalTransferAlternatives(params: {
  origin: string;
  destination: string;
  arrivalByMinutes: number;
  dayType: ServiceDayType;
}): Promise<TimedRoute[]> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return [];
  }
  return findArrivalTransferAlternativesFromTimetables(await loadOfflineTimetables(), params);
}

/**
 * 出発時刻検索の画面表示に必要な「最短」「乗換少なめ」「乗換駅違いの代替」を1回の呼び出しでまとめて求める。
 * `findTimedRouteOptions` と `findTransferAlternatives` を個別に呼ぶと「最短」経路の探索が二重に走ってしまうため、
 * ここで最短探索の結果を使い回して無駄な探索を減らす。
 */
export async function findDepartureRouteResults(params: {
  origin: string;
  destination: string;
  departureMinutes: number;
  dayType: ServiceDayType;
}): Promise<{ options: Record<RoutePreference, TimedRoute | null>; transferAlternatives: TimedRoute[] }> {
  if (!params.origin || !params.destination || params.origin === params.destination || !linesByStation.has(params.origin) || !linesByStation.has(params.destination)) {
    return { options: { fastest: null, fewestTransfers: null }, transferAlternatives: [] };
  }
  const timetables = await loadOfflineTimetables();
  const fastest = findTimedRouteFromTimetables(timetables, { ...params, preference: "fastest" });
  const fewestTransfers = findTimedRouteFromTimetables(timetables, { ...params, preference: "fewestTransfers" });
  const transferAlternatives = findTransferAlternativesFromTimetables(timetables, params, fastest);
  return { options: { fastest, fewestTransfers }, transferAlternatives };
}

/** 起動直後にアイドル時間で時刻表本体を先読みし、初回検索時に通信できない場合でも失敗しないようにする。 */
export function preloadOfflineTimetables(): void {
  void loadOfflineTimetables();
}

export function getLine(lineId: LineId) {
  return lineById.get(lineId);
}

/** 出発マーカーなどで使う、駅に乗り入れる路線。経路が確定している場合はその路線を優先する。 */
export function getLineForStation(station: string, preferredLineId?: LineId) {
  const lines = linesByStation.get(station) ?? [];
  return lines.find((line) => line.id === preferredLineId) ?? lines[0];
}

/** 駅に乗り入れる全路線。乗換駅の色分け表示などに使う。優先路線があれば先頭に並べる。 */
export function getLinesForStation(station: string, preferredLineId?: LineId) {
  const lines = linesByStation.get(station) ?? [];
  if (!preferredLineId) return lines;
  const preferred = lines.filter((line) => line.id === preferredLineId);
  const rest = lines.filter((line) => line.id !== preferredLineId);
  return [...preferred, ...rest];
}
