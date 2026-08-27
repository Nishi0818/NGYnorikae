export type ServiceDayType = "weekday" | "holiday";

/** 経路結果を並べる基準。最短は到着時刻、乗換少なめは乗換回数を優先する。 */
export type RoutePreference = "fastest" | "fewestTransfers";

/** 地下鉄6路線の固有id。乗換時間テーブル等、地下鉄固有のロジックで使う。 */
export type SubwayLineId =
  | "higashiyama"
  | "meijo"
  | "meiko"
  | "tsurumai"
  | "sakuradori"
  | "kamiida";

/**
 * 路線・系統を横断的に扱うための汎用id。地下鉄は上記6種、バスは`bus_`で始まる
 * GTFSパターンid（例: "bus_0001001"）。将来的に名鉄を追加する場合もこの型を使う。
 */
export type LineId = SubwayLineId | (string & {});

export type SubwayLine = {
  id: LineId;
  name: string;
  color: string;
  textColor: string;
  stations: readonly string[];
  distances: readonly number[];
  loop?: boolean;
  positiveDirectionLabel: string;
  negativeDirectionLabel: string;
};

export type RouteLeg = {
  lineId: LineId;
  lineName: string;
  lineColor: string;
  textColor: string;
  directionLabel: string;
  boardStation: string;
  alightStation: string;
  departureMinutes: number;
  arrivalMinutes: number;
  waitMinutes: number;
  transferMinutes: number;
  rideMinutes: number;
  distanceKm: number;
};

export type TimedRoute = {
  origin: string;
  destination: string;
  requestedDepartureMinutes: number;
  actualDepartureMinutes: number;
  arrivalMinutes: number;
  totalMinutes: number;
  transferCount: number;
  fare: number;
  distanceKm: number;
  legs: RouteLeg[];
};
