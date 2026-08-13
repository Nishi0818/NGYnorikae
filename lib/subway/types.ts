export type ServiceDayType = "weekday" | "holiday";

export type LineId =
  | "higashiyama"
  | "meijo"
  | "meiko"
  | "tsurumai"
  | "sakuradori"
  | "kamiida";

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
