import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated as RNAnimated, FlatList, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text as RNText, TextInput, type TextProps, type TextStyle, useColorScheme, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { DateTimeField } from "@/components/datetime-fields";

import {
  ALL_STATIONS,
  BUS_LINE_COLOR,
  SUBWAY_LINES,
  TIMETABLE_REVISIONS,
  findArrivalRouteResults,
  findDepartureRouteResults,
  formatMinutes,
  getLinesForStation,
  getStationsForLine,
  getServiceDayType,
  isBusLine,
  isMeitetsuLine,
  isWalkConnector,
  japaneseHolidayName,
  loadBusNetwork,
  loadMeitetsuNetwork,
  matchesStationQuery,
  minutesFromTimeText,
  preloadOfflineTimetables,
} from "@/lib/subway/network";
import type { LineId, RoutePreference, ServiceDayType, SubwayLine, TimedRoute } from "@/lib/subway/types";
import { loadSearchHistory, mergeSearchHistory, saveSearchHistory, type SearchHistoryEntry } from "@/lib/subway/search-history";

type StationField = "origin" | "destination";
type StationKindFilter = "all" | "rail" | "bus";
const STATION_KIND_SEQUENCE: readonly StationKindFilter[] = ["all", "rail", "bus"];
const STATION_KIND_META: Record<StationKindFilter, { icon: "layers-outline" | "train-outline" | "bus-outline"; label: string; shortLabel: string }> = {
  all: { icon: "layers-outline", label: "すべて", shortLabel: "すべて" },
  rail: { icon: "train-outline", label: "駅のみ（地下鉄・名鉄）", shortLabel: "電車" },
  bus: { icon: "bus-outline", label: "停留所のみ（バス）", shortLabel: "バス" },
};
type DayMode = "auto" | ServiceDayType;
type TimeMode = "departure" | "arrival";
type RouteOptions = Record<RoutePreference, TimedRoute | null>;
const APP_ICON = require("../../assets/images/icon.png");
const REDUCED_FONT_WEIGHTS: Partial<Record<string, TextStyle["fontWeight"]>> = { "600": "500", "700": "500", "800": "600" };

const COLORS = {
  ink: "#37312B",
  navy: "#0B5B95",
  teal: "#246E8D",
  amber: "#F5C400",
  blue: "#1B75BB",
  red: "#E24B3B",
  canvas: "#FFFFFF",
  surface: "#FFFFFF",
  elevated: "#FFFFFF",
  border: "#ECECEC",
  muted: "#6D625A",
  lightMuted: "#C4B9AB",
  paleTeal: "#FFFFFF",
  paleAmber: "#FFFFFF",
  danger: "#B33A2B",
  glass: "rgba(255,255,255,0.82)",
  overline: "#5E5144",
  transferText: "#81510D",
};

const DARK_COLORS: typeof COLORS = {
  ink: "#EAE3D7",
  navy: "#93B9DC",
  teal: "#95C0CE",
  amber: "#E6C65C",
  blue: "#8FB9D9",
  red: "#DF8F7C",
  canvas: "#1F1C19",
  surface: "#292622",
  elevated: "#322E28",
  border: "#3B372F",
  muted: "#ADA294",
  lightMuted: "#6E665C",
  paleTeal: "#292622",
  paleAmber: "#292622",
  danger: "#E0785F",
  glass: "rgba(43,39,34,0.88)",
  overline: "#C9BBA6",
  transferText: "#D8BA6C",
};

function useAppColors() {
  return useColorScheme() === "dark" ? DARK_COLORS : COLORS;
}

function Text({ style, ...props }: TextProps & { suppressHydrationWarning?: boolean }) {
  const styles = useAppStyles();
  const originalWeight = StyleSheet.flatten(style)?.fontWeight;
  const reducedWeight = REDUCED_FONT_WEIGHTS[String(originalWeight)];

  return <RNText {...props} style={[styles.appText, style, reducedWeight ? { fontWeight: reducedWeight } : undefined]} />;
}

/** 端末のアニメーション軽減設定 (Webはprefers-reduced-motion、ネイティブはAccessibilityInfo) を読む。 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(query.matches);
      const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
      query.addEventListener?.("change", onChange);
      return () => query.removeEventListener?.("change", onChange);
    }
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}

const WEB_PRESS_TRANSITION = Platform.OS === "web" ? ({ transitionProperty: "transform, opacity", transitionDuration: "120ms", transitionTimingFunction: "ease-out" } as object) : null;

/**
 * 全ボタン共通のマイクロインタラクション。
 * 押した瞬間に少しだけ沈み (scale 0.96)、わずかに暗くなる (opacity 0.92)。
 * Pressable標準のpressed状態で実装し、Webでも確実に効くようにする。
 * 青いタップハイライトは使わない。アニメーション軽減設定では無効化する。
 */
function MicroPressable({ style, children, disabled, ...props }: ComponentProps<typeof Pressable>) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        style as never,
        WEB_PRESS_TRANSITION as never,
        pressed && !disabled && !reducedMotion ? { transform: [{ scale: 0.96 }], opacity: 0.92 } : undefined,
      ]}
    >
      {children as ReactNode}
    </Pressable>
  );
}

function hapticLight() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function hapticSelection() {
  if (Platform.OS === "web") return;
  Haptics.selectionAsync().catch(() => {});
}

/** 出現時に少し下からフェードインするラッパー (検索結果の区間表示用)。 */
function FadeInView({ delay = 0, style, children }: { delay?: number; style?: ComponentProps<typeof View>["style"]; children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const progress = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    const animation = RNAnimated.timing(progress, { toValue: 1, duration: 280, delay, useNativeDriver: Platform.OS !== "web" });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reducedMotion]);
  return (
    <RNAnimated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </RNAnimated.View>
  );
}

/** 駅/停留所の切替。選択中のピルがスライドして移動する。 */
function StationKindSegments({ value, onChange }: { value: StationKindFilter; onChange: (kind: StationKindFilter) => void }) {
  const reducedMotion = usePrefersReducedMotion();
  const styles = useAppStyles();
  const colors = useAppColors();
  const [width, setWidth] = useState(0);
  const slide = useRef(new RNAnimated.Value(0)).current;
  const laidOut = useRef(false);
  const index = STATION_KIND_SEQUENCE.indexOf(value);
  const segmentWidth = width > 0 ? (width - 12) / STATION_KIND_SEQUENCE.length : 0;
  useEffect(() => {
    if (width === 0) return;
    const target = index * (segmentWidth + 3);
    if (!laidOut.current || reducedMotion) { laidOut.current = true; slide.setValue(target); return; }
    RNAnimated.spring(slide, { toValue: target, friction: 8, tension: 110, useNativeDriver: Platform.OS !== "web" }).start();
  }, [index, width, segmentWidth, slide, reducedMotion]);
  return (
    <View style={styles.stationKindSegmented} accessibilityRole="tablist" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <RNAnimated.View style={[styles.stationKindPill, { width: segmentWidth, transform: [{ translateX: slide }] }]} />}
      {STATION_KIND_SEQUENCE.map((kind) => {
        const active = value === kind;
        return (
          <MicroPressable key={kind} style={styles.stationKindSegment} onPress={() => onChange(kind)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={STATION_KIND_META[kind].label}>
            <Ionicons name={STATION_KIND_META[kind].icon} size={16} color={active ? colors.navy : colors.muted} />
            <Text style={[styles.stationKindSegmentText, active && styles.stationKindSegmentTextActive]}>{STATION_KIND_META[kind].shortLabel}</Text>
          </MicroPressable>
        );
      })}
    </View>
  );
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseDateInput(input: string) {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const value = new Date(Number(year), Number(month) - 1, Number(day));
  return value.getFullYear() === Number(year) && value.getMonth() === Number(month) - 1 && value.getDate() === Number(day) ? value : null;
}

function dayLabel(dayType: ServiceDayType) {
  return dayType === "weekday" ? "平日" : "土休日";
}

/** 曜日表示の色: 日曜と祝日は赤、土曜は青、それ以外は通常色 (undefined)。 */
function weekdayColor(date: Date, palette: typeof COLORS) {
  if (date.getDay() === 0 || japaneseHolidayName(date)) return palette.red;
  if (date.getDay() === 6) return palette.blue;
  return undefined;
}

/** 名港線は名城線と同じ紫のため、単独表示のときは外側を紫・内側を白の二重丸にして見分けやすくする。 */
function markerFill(line: SubwayLine) {
  if (line.id === "meiko") return { background: line.color, ring: line.color, innerDotColor: COLORS.surface, iconColor: line.color };
  return { background: line.color, ring: line.color, innerDotColor: undefined, iconColor: line.textColor };
}

function StationMarker({ type, station, preferredLineId }: { type: StationField; station: string; preferredLineId?: LineId }) {
  const styles = useAppStyles();
  const colors = useAppColors();
  const allLines = getLinesForStation(station, preferredLineId);
  const icon = type === "origin" ? "radio-button-on" : "location";

  // マーカーの色構成には地下鉄路線のみを使う。バス・名鉄は「駅名が一致すれば
  // 同一地点」という簡易的な仕組みで地下鉄駅と統合されているため、実際には
  // 別施設の隣接駅（例: 堀田＝地下鉄名城線と名鉄名古屋本線）でも同じ駅として
  // 扱われてしまい、そのまま色に混ぜると地下鉄以外の色（名鉄の赤など）が
  // 紛れ込む。地下鉄以外の路線は無視し、地下鉄路線が無い駅（バス停/名鉄駅
  // 単独）だけ、その駅にある最初の路線の色をそのまま使う。
  const subwayLines = allLines.filter((line) => !isBusLine(line.id) && !isMeitetsuLine(line.id) && !isWalkConnector(line.id));
  const hasBus = allLines.some((line) => isBusLine(line.id));
  const lines = subwayLines.length > 0 ? subwayLines : allLines.slice(0, 1);

  const marker =
    lines.length < 2 ? (
      (() => {
        const line = lines[0];
        const fill = line && markerFill(line);
        return (
          <View style={[styles.marker, type === "origin" ? styles.originMarker : styles.destinationMarker, fill && { backgroundColor: fill.background, borderColor: fill.ring }]}>
            {fill?.innerDotColor && <View style={[styles.markerInnerDot, { backgroundColor: fill.innerDotColor }]} />}
            <Ionicons name={icon} size={17} color={fill?.iconColor ?? colors.ink} />
          </View>
        );
      })()
    ) : (
      // 2路線が乗り入れる乗換駅は、円を斜めに切り分けてそれぞれの路線色を示す。
      (() => {
        const [first, second] = lines;
        const fillA = markerFill(first);
        const fillB = markerFill(second);
        return (
          <View style={[styles.marker, styles.splitMarker]}>
            <View style={[styles.markerDiagonalBase, { backgroundColor: fillA.background }]} />
            {/* Web専用のclip-pathで円を斜め(右上→左下)に切り分ける。ReactNativeのViewStyleに型が無いためasで許可する。 */}
            <View style={[styles.markerDiagonalOverlay, { backgroundColor: fillB.background, clipPath: "polygon(100% 0%, 100% 100%, 0% 100%)" } as any]} />
            <View style={styles.markerIconBadge}>
              <Ionicons name={icon} size={13} color={colors.ink} />
            </View>
          </View>
        );
      })()
    );

  // その駅がバス停でもある場合は、色構成には含めず、外周に緑の細いリングだけを添える。
  return hasBus ? <View style={styles.markerBusRing}>{marker}</View> : marker;
}

function ResultPanel({
  route,
  routeOptions,
  preference,
  onSelectPreference,
  transferAlternatives,
  alternativeIndex,
  onSelectAlternative,
  detailsOpen,
  onToggleDetails,
}: {
  route: TimedRoute;
  routeOptions: RouteOptions;
  preference: RoutePreference;
  onSelectPreference: (preference: RoutePreference) => void;
  transferAlternatives: TimedRoute[];
  alternativeIndex: number;
  onSelectAlternative: (index: number) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const styles = useAppStyles();
  const colors = useAppColors();
  const reducedMotion = usePrefersReducedMotion();
  const chevronRotation = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { chevronRotation.setValue(detailsOpen ? 1 : 0); return; }
    RNAnimated.spring(chevronRotation, { toValue: detailsOpen ? 1 : 0, friction: 7, tension: 90, useNativeDriver: Platform.OS !== "web" }).start();
  }, [detailsOpen, reducedMotion, chevronRotation]);
  const destinationLeg = route.legs[route.legs.length - 1];
  const choices = ([
    ["fastest", "最短", "到着時刻を優先"],
    ["fewestTransfers", "乗換少なめ", "乗換回数を優先"],
  ] as const).filter(([value]) => routeOptions[value]);
  const [preferenceGroupWidth, setPreferenceGroupWidth] = useState(0);
  const preferenceSlide = useRef(new RNAnimated.Value(0)).current;
  const preferenceLaidOut = useRef(false);
  const preferenceIndex = Math.max(0, choices.findIndex(([value]) => value === preference));
  const preferenceSegmentWidth = preferenceGroupWidth > 0 ? (preferenceGroupWidth - 6) / choices.length : 0;
  useEffect(() => {
    if (preferenceGroupWidth === 0) return;
    const target = preferenceIndex * preferenceSegmentWidth;
    if (!preferenceLaidOut.current || reducedMotion) { preferenceLaidOut.current = true; preferenceSlide.setValue(target); return; }
    RNAnimated.spring(preferenceSlide, { toValue: target, friction: 8, tension: 110, useNativeDriver: Platform.OS !== "web" }).start();
  }, [preferenceIndex, preferenceGroupWidth, preferenceSegmentWidth, preferenceSlide, reducedMotion]);

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(320)} style={styles.resultArea}>
      <View style={[styles.routePreferenceGroup, styles.glassPanel]} accessibilityRole="tablist" onLayout={(event) => setPreferenceGroupWidth(event.nativeEvent.layout.width)}>
        {preferenceGroupWidth > 0 && choices.length > 1 && <RNAnimated.View style={[styles.routePreferencePill, { width: preferenceSegmentWidth, transform: [{ translateX: preferenceSlide }] }]} />}
        {choices.map(([value, label, detail]) => {
          const candidate = routeOptions[value];
          if (!candidate) return null;
          const isActive = preference === value;
          return (
            <MicroPressable
              key={value}
              style={styles.routePreferenceButton}
              onPress={() => onSelectPreference(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${label}、${candidate.totalMinutes}分、${candidate.transferCount === 0 ? "乗換なし" : `乗換${candidate.transferCount}回`}`}
            >
              <Text style={[styles.routePreferenceLabel, isActive && styles.routePreferenceLabelActive]}>{label}</Text>
              <Text style={[styles.routePreferenceMeta, isActive && styles.routePreferenceMetaActive]}>{candidate.totalMinutes}分 · {candidate.transferCount === 0 ? "乗換なし" : `${candidate.transferCount}回`}</Text>
              <Text style={[styles.routePreferenceHint, isActive && styles.routePreferenceHintActive]}>{detail}</Text>
            </MicroPressable>
          );
        })}
      </View>
      {preference === "fastest" && transferAlternatives.length > 1 && (
        <View style={styles.alternativeGroup} accessibilityRole="tablist">
          {transferAlternatives.map((alternative, index) => {
            const viaStation = alternative.legs[1]?.boardStation ?? alternative.legs[0]?.alightStation ?? "";
            const isActive = index === alternativeIndex;
            return (
              <MicroPressable
                key={`${viaStation}-${index}`}
                style={[styles.alternativeChip, isActive && styles.alternativeChipActive]}
                onPress={() => onSelectAlternative(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${viaStation}経由、${alternative.totalMinutes}分`}
              >
                <Text style={[styles.alternativeChipText, isActive && styles.alternativeChipTextActive]}>{viaStation}経由 · {alternative.totalMinutes}分</Text>
              </MicroPressable>
            );
          })}
        </View>
      )}
      <Text style={styles.resultOverline}>{preference === "fastest" ? "最短の経路" : "乗換少なめの経路"}</Text>
      <View style={styles.resultHero}>
        <View>
          <Text style={styles.resultDeparture}>{formatMinutes(route.actualDepartureMinutes)}</Text>
          <Text style={styles.resultPlace}>{route.origin}</Text>
        </View>
        <View style={styles.resultArrowWrap}>
          <Text style={styles.resultDuration}>{route.totalMinutes}分</Text>
          <Ionicons name="arrow-forward" size={22} color={colors.navy} />
          <Text style={styles.resultTransfer}>{route.transferCount === 0 ? "乗換なし" : `乗換 ${route.transferCount}回`}</Text>
          <Text style={styles.resultFare}>{route.fare}円</Text>
        </View>
        <View style={styles.resultArrivalWrap}>
          <Text style={styles.resultArrival}>{formatMinutes(route.arrivalMinutes)}</Text>
          <Text style={styles.resultPlace}>{route.destination}</Text>
        </View>
      </View>

      <View style={styles.routeSteps}>
        {route.legs.map((leg, index) => {
          const nextLeg = route.legs[index + 1];
          const walkLeg = isWalkConnector(leg.lineId);
          // 徒歩連絡の前後は、連絡区間自体が「乗換」を表すため、重ねて乗換ボックスを出さない。
          const showTransferAfter = nextLeg && !walkLeg && !isWalkConnector(nextLeg.lineId);
          return (
            <FadeInView key={`${leg.lineId}-${leg.boardStation}-${leg.alightStation}-${index}`} delay={index * 70}>
              {walkLeg ? (
                <View style={[styles.walkLegSummary, styles.glassPanel]}>
                  <Ionicons name="walk-outline" size={18} color={colors.teal} />
                  <Text style={styles.walkLegText}>{leg.boardStation} から {leg.alightStation} まで徒歩で連絡（約{Math.max(1, leg.rideMinutes)}分）</Text>
                </View>
              ) : (
                <View style={[styles.routeLegSummary, styles.glassPanel]}>
                  <View style={[styles.routeLegColor, { backgroundColor: leg.lineColor }]} />
                  <View style={styles.routeLegCopy}>
                    <View style={styles.routeLegHeading}>
                      <View style={[styles.linePill, { backgroundColor: leg.lineColor }]}>
                        <Text style={[styles.linePillText, { color: leg.textColor }]}>{leg.lineName}</Text>
                      </View>
                      <Text style={styles.routeLegDirection}>{leg.directionLabel}</Text>
                    </View>
                    <Text style={styles.routeLegMeta}>{leg.boardStation} {formatMinutes(leg.departureMinutes)}発 → {leg.alightStation} {formatMinutes(leg.arrivalMinutes)}着</Text>
                  </View>
                  <Ionicons name={isBusLine(leg.lineId) ? "bus-outline" : "train-outline"} size={20} color={colors.navy} />
                </View>
              )}
              {showTransferAfter && (
                <View style={[styles.routeTransferSummary, styles.glassPanel]}>
                  <Ionicons name="walk-outline" size={16} color={colors.muted} />
                  <Text style={styles.routeTransferText}>{leg.alightStation}で{nextLeg.lineName}へ乗換 · {nextLeg.transferMinutes}分</Text>
                </View>
              )}
            </FadeInView>
          );
        })}
      </View>

      <MicroPressable style={styles.detailToggle} onPress={onToggleDetails} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}>
        <Text style={styles.detailToggleText}>{detailsOpen ? "経路詳細を閉じる" : "経路の詳細を見る"}</Text>
        <RNAnimated.View style={{ transform: [{ rotate: chevronRotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}><Ionicons name="chevron-down" size={18} color={colors.navy} /></RNAnimated.View>
      </MicroPressable>

      {detailsOpen && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(220)} style={styles.detailList}>
          {route.legs.map((leg, index) => {
            const previousLeg = route.legs[index - 1];
            const walkLeg = isWalkConnector(leg.lineId);
            const showTransferBefore = index > 0 && !walkLeg && previousLeg && !isWalkConnector(previousLeg.lineId);
            return (
              <View key={`${leg.lineId}-${leg.boardStation}-${leg.alightStation}-${index}`}>
                {showTransferBefore && (
                  <View style={styles.detailTransfer}>
                    <View style={styles.detailConnector} />
                    <Text style={styles.detailTransferText}>{leg.boardStation}で乗換・{leg.transferMinutes}分</Text>
                  </View>
                )}
                <View style={styles.detailLeg}>
                  <View style={[styles.detailLine, walkLeg ? styles.detailLineWalk : { backgroundColor: leg.lineColor }]} />
                  <View style={styles.detailTimes}>
                    <Text style={styles.detailTime}>{formatMinutes(leg.departureMinutes)}</Text>
                    <Text style={styles.detailTime}>{formatMinutes(leg.arrivalMinutes)}</Text>
                  </View>
                  <View style={styles.detailCopy}>
                    <Text style={styles.detailStation}>{leg.boardStation}</Text>
                    <Text style={styles.detailDirection}>
                      {walkLeg ? `徒歩で連絡・${Math.max(1, leg.rideMinutes)}分` : `${leg.lineName}・${leg.directionLabel}・乗車 ${leg.rideMinutes}分`}
                    </Text>
                    <Text style={styles.detailStation}>{leg.alightStation}</Text>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={styles.detailFooter}>
            <Text style={styles.detailFooterText}>運賃 {route.fare}円 · 距離 {route.distanceKm.toFixed(1)} km</Text>
            <Text style={styles.detailFooterText}>最終区間 {destinationLeg.lineName}</Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const initialNow = useMemo(() => new Date(), []);
  const styles = useAppStyles();
  const colors = useAppColors();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [dateText, setDateText] = useState(formatDateInput(initialNow));
  const [timeText, setTimeText] = useState(formatTimeInput(initialNow));
  const [dayMode, setDayMode] = useState<DayMode>("auto");
  const [timeMode, setTimeMode] = useState<TimeMode>("departure");
  const [pickerField, setPickerField] = useState<StationField | null>(null);
  const [stationQuery, setStationQuery] = useState("");
  const [stationLineFilter, setStationLineFilter] = useState<LineId | "all">("all");
  // バス統合で駅の選択肢が大幅に増えたため、「駅(地下鉄・名鉄)のみ」「停留所(バス)のみ」を切り替えられるようにする。
  // デフォルトは電車モード(地下鉄・名鉄)。バス停まで含めた一覧はユーザーが明示的に切り替える。
  const [stationKindFilter, setStationKindFilter] = useState<StationKindFilter>("rail");
  const [showOptions, setShowOptions] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showDataInfo, setShowDataInfo] = useState(false);
  const [showCacheClearDialog, setShowCacheClearDialog] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOptions | null>(null);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("fastest");
  const [transferAlternatives, setTransferAlternatives] = useState<TimedRoute[]>([]);
  const [alternativeIndex, setAlternativeIndex] = useState(0);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const [highlightedStation, setHighlightedStation] = useState<string | null>(null);
  const [highlightedHistoryId, setHighlightedHistoryId] = useState<string | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // バス・名鉄データは実行時取得のため、読み込み完了を検知して駅一覧の再計算(useMemo)を促す。
  // バス・名鉄は並行して読み込まれるため、同じboolean(true)を2回setするとReactが
  // 2回目の状態更新を「変化なし」とみなして再描画をスキップし、片方だけ反映された
  // 駅一覧のまま止まってしまう不具合があった。カウンタにして毎回必ず値を変える。
  const [dataLoadTick, setDataLoadTick] = useState(0);
  const bumpDataLoadTick = () => setDataLoadTick((tick) => tick + 1);

  const selectedDate = parseDateInput(dateText);
  const automaticDayType = selectedDate ? getServiceDayType(selectedDate) : "weekday";
  const automaticHolidayName = selectedDate ? japaneseHolidayName(selectedDate) : null;
  const serviceDayType: ServiceDayType = dayMode === "auto" ? automaticDayType : dayMode;
  const stationMatches = useMemo(() => {
    const query = stationQuery.trim();
    return getStationsForLine(stationLineFilter)
      .filter((station) => matchesStationQuery(station, query))
      .filter((station) => {
        if (stationKindFilter === "all") return true;
        const lines = getLinesForStation(station);
        return stationKindFilter === "bus" ? lines.some((line) => isBusLine(line.id)) : lines.some((line) => !isBusLine(line.id));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataLoadTickは駅一覧(モジュール内キャッシュ)の再取得トリガーとして使うだけで値自体は参照しない
  }, [stationLineFilter, stationQuery, stationKindFilter, dataLoadTick]);
  const revisionDates = Array.from(
    SUBWAY_LINES.reduce((groups, line) => {
      const date = TIMETABLE_REVISIONS[line.id];
      groups.set(date, [...(groups.get(date) ?? []), line.name]);
      return groups;
    }, new Map<string, string[]>()),
  )
    .map(([date, names]) => `${names.join("・")} ${date}`)
    .join(" · ");
  const route =
    routePreference === "fastest" && transferAlternatives.length > 1
      ? (transferAlternatives[alternativeIndex] ?? transferAlternatives[0])
      : routeOptions?.[routePreference] ?? routeOptions?.fastest ?? routeOptions?.fewestTransfers ?? null;

  useEffect(() => {
    setSearchHistory(loadSearchHistory());
    setHistoryLoaded(true);
  }, []);

  // 静的書き出しはライト配色・ビルド時刻で作られ、ハイドレーション後も
  // その見た目が画面に残り続けてしまう（ダークモード端末で一部だけ
  // ライト配色になる等）。そのためマウント完了後に画面を作り直し、
  // 検索条件の日時もマウント完了後にだけ出す。
  useEffect(() => {
    setHydrated(true);
  }, []);

  // 初回表示を邪魔しないよう、アイドル時間に時刻表本体を先読みしておく。
  // これにより「開いた直後に通信できなくなった」場合でも検索が失敗しない。
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const scheduleIdle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
      ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const cancelIdle = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      ?? window.clearTimeout;
    const id = scheduleIdle(() => {
      preloadOfflineTimetables();
      // バスは地下鉄と違いビルド時にバンドルせず実行時取得のため、
      // 通信状態でのアイドル先読みが失敗しても検索自体は地下鉄のみで継続できるよう握りつぶす。
      void loadBusNetwork().then(bumpDataLoadTick).catch((busLoadError) => console.error("bus load failed", busLoadError));
      void loadMeitetsuNetwork().then(bumpDataLoadTick).catch((meitetsuLoadError) => console.error("meitetsu load failed", meitetsuLoadError));
    });
    return () => cancelIdle(id);
  }, []);

  useEffect(() => {
    if (historyLoaded) saveSearchHistory(searchHistory);
  }, [historyLoaded, searchHistory]);

  function openStationPicker(field: StationField) {
    setPickerField(field);
    setStationQuery("");
    setStationLineFilter("all");
    setStationKindFilter("rail");
  }

  function selectStationKindFilter(kind: StationKindFilter) {
    setStationKindFilter(kind);
    // 地下鉄・名鉄の路線チップは「停留所のみ」表示とは噛み合わず0件になってしまうため、切替時にリセットする。
    if (kind === "bus") setStationLineFilter("all");
  }

  // タップした行を一瞬ハイライトしてから選択を反映する。
  function pressStation(station: string) {
    if (reducedMotion) {
      selectStation(station);
      return;
    }
    setHighlightedStation(station);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      selectStation(station);
      setHighlightedStation(null);
    }, 150);
  }

  function pressHistory(entry: SearchHistoryEntry) {
    if (reducedMotion) {
      applyHistory(entry);
      return;
    }
    setHighlightedHistoryId(entry.id);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      applyHistory(entry);
      setHighlightedHistoryId(null);
    }, 150);
  }

  function swapStations() {
    hapticLight();
    setOrigin(destination);
    setDestination(origin);
  }

  function selectStation(station: string) {
    hapticSelection();
    if (pickerField === "origin") setOrigin(station);
    if (pickerField === "destination") setDestination(station);
    setPickerField(null);
  }

  function clearStation(field: StationField) {
    if (field === "origin") setOrigin("");
    if (field === "destination") setDestination("");
    setRouteOptions(null);
    setTransferAlternatives([]);
    setShowDetails(false);
    setError("");
  }

  async function clearAppCacheAndReload() {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setShowCacheClearDialog(false);
      setError("キャッシュ更新はウェブ版で利用できます。");
      return;
    }
    if (!navigator.onLine) {
      setShowCacheClearDialog(false);
      setError("オフライン中は更新できません。通信できる状態でお試しください。");
      return;
    }

    setIsClearingCache(true);
    try {
      const updateCheckUrl = new URL("/", window.location.origin);
      updateCheckUrl.searchParams.set("cache-check", String(Date.now()));
      const updateCheck = await fetch(updateCheckUrl.toString(), { cache: "no-store" });
      if (!updateCheck.ok) throw new Error("Update check failed");
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.unregister();
      }
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.filter((name) => name.startsWith("nagoya-subway-")).map((name) => caches.delete(name)));
      }
      const refreshUrl = new URL(window.location.href);
      refreshUrl.searchParams.set("refresh", String(Date.now()));
      window.location.replace(refreshUrl.toString());
    } catch {
      setIsClearingCache(false);
      setShowCacheClearDialog(false);
      setError("キャッシュを更新できませんでした。通信状態を確認して、もう一度お試しください。");
    }
  }

  function useNow() {
    const now = new Date();
    setDateText(formatDateInput(now));
    setTimeText(formatTimeInput(now));
    setDayMode("auto");
  }

  function applyHistory(entry: SearchHistoryEntry) {
    setOrigin(entry.origin);
    setDestination(entry.destination);
    setDateText(entry.dateText);
    setTimeText(entry.timeText);
    setDayMode(entry.dayMode);
    setTimeMode(entry.timeMode ?? "departure");
    setRouteOptions(null);
    setTransferAlternatives([]);
    setShowDetails(false);
    setError("");
  }

  function removeHistory(id: string) {
    setSearchHistory((current) => current.filter((entry) => entry.id !== id));
  }

  async function runSearch() {
    hapticLight();
    setError("");
    setRouteOptions(null);
    setTransferAlternatives([]);
    setAlternativeIndex(0);
    setShowDetails(false);
    if (!origin || !destination) {
      setError("出発駅と到着駅を選択してください。");
      return;
    }
    if (origin === destination) {
      setError("出発駅と到着駅は異なる駅を選択してください。");
      return;
    }
    if (!selectedDate) {
      setError("日付は YYYY-MM-DD 形式で入力してください。");
      return;
    }
    const timeMinutes = minutesFromTimeText(timeText);
    if (timeMinutes === null || timeMinutes < 0 || timeMinutes >= 1440) {
      setError(timeMode === "arrival" ? "到着時刻は 00:00〜23:59 で入力してください。" : "出発時刻は 00:00〜23:59 で入力してください。");
      return;
    }
    setIsSearching(true);
    try {
      const results = timeMode === "arrival"
        ? await findArrivalRouteResults({ origin, destination, arrivalByMinutes: timeMinutes, dayType: serviceDayType })
        : await findDepartureRouteResults({ origin, destination, departureMinutes: timeMinutes, dayType: serviceDayType });
      const nextOptions: RouteOptions = results.options;
      const nextAlternatives: TimedRoute[] = results.transferAlternatives;
      const nextRoute = nextOptions.fastest ?? nextOptions.fewestTransfers;
      if (!nextRoute) {
        setError(
          timeMode === "arrival"
            ? "指定時刻までに到着できる経路が見つかりませんでした。到着条件を変更してください。"
            : "指定時刻以降に利用できる経路が見つかりませんでした。出発条件を変更してください。",
        );
        return;
      }
      setRouteOptions(nextOptions);
      setRoutePreference(nextOptions.fastest ? "fastest" : "fewestTransfers");
      setTransferAlternatives(nextAlternatives);
      setAlternativeIndex(0);
      const historyEntry: SearchHistoryEntry = {
        id: `${origin}::${destination}::${dateText}::${timeText}::${dayMode}::${timeMode}`,
        origin,
        destination,
        dateText,
        timeText,
        dayMode,
        timeMode,
        savedAt: new Date().toISOString(),
      };
      setSearchHistory((current) => mergeSearchHistory(current, historyEntry));
    } catch {
      setError("時刻表を読み込めませんでした。もう一度お試しください。");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <SafeAreaView key={hydrated ? "client" : "ssr"} style={styles.safeArea}>
      <StatusBar style={useColorScheme() === "dark" ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}><Image source={APP_ICON} style={styles.brandIcon} accessibilityLabel="なごや乗換案内のアイコン" /></View>
            <Text style={styles.brandName}>なごや乗換案内</Text>
          </View>
          <View style={styles.topActions}>
            <View style={styles.offlineStatus}>
              <Ionicons name="cloud-offline-outline" size={14} color={colors.teal} />
              <Text style={styles.offlineText}>オフラインで稼働</Text>
            </View>
            <MicroPressable style={styles.cacheRefreshButton} onPress={() => setShowCacheClearDialog(true)} accessibilityRole="button" accessibilityLabel="キャッシュを更新する">
              <Ionicons name="refresh" size={18} color={colors.navy} />
            </MicroPressable>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.introTitle}>次の列車を探す</Text>
          <Text style={styles.introHint}>地下鉄・バス・名鉄の時刻表と乗換時間を端末内で検索します。</Text>
        </View>

        <View style={[styles.routeCard, styles.glassPanel]}>
          <View style={styles.routeFields}>
            <View style={styles.routeFieldRow}>
              <MicroPressable style={styles.routeField} onPress={() => openStationPicker("origin")} accessibilityRole="button" accessibilityLabel="出発駅を選択">
                <StationMarker type="origin" station={origin} preferredLineId={route?.origin === origin ? route.legs[0]?.lineId : undefined} />
                <View style={styles.routeFieldCopy}>
                  <Text style={styles.routeLabel}>出発</Text>
                  <Text style={[styles.routeValue, !origin && styles.routePlaceholder]}>{origin || "出発駅を選択"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.lightMuted} />
              </MicroPressable>
              {origin ? <MicroPressable style={styles.fieldInlineClear} onPress={() => clearStation("origin")} accessibilityRole="button" accessibilityLabel="出発駅を消去"><Ionicons name="close" size={16} color={colors.muted} /></MicroPressable> : null}
            </View>
            <View style={styles.routeConnectorRow}><View style={styles.routeConnector} /></View>
            <View style={styles.routeFieldRow}>
              <MicroPressable style={styles.routeField} onPress={() => openStationPicker("destination")} accessibilityRole="button" accessibilityLabel="到着駅を選択">
                <StationMarker type="destination" station={destination} preferredLineId={route?.destination === destination ? route.legs[route.legs.length - 1]?.lineId : undefined} />
                <View style={styles.routeFieldCopy}>
                  <Text style={styles.routeLabel}>到着</Text>
                  <Text style={[styles.routeValue, !destination && styles.routePlaceholder]}>{destination || "到着駅を選択"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.lightMuted} />
              </MicroPressable>
              {destination ? <MicroPressable style={styles.fieldInlineClear} onPress={() => clearStation("destination")} accessibilityRole="button" accessibilityLabel="到着駅を消去"><Ionicons name="close" size={16} color={colors.muted} /></MicroPressable> : null}
            </View>
          </View>
          <MicroPressable
            style={styles.swapButton}
            onPress={swapStations}
            accessibilityRole="button"
            accessibilityLabel="出発駅と到着駅を入れ替える"
          >
            <Ionicons name="swap-vertical" size={18} color={colors.navy} />
          </MicroPressable>
        </View>

        <MicroPressable style={[styles.departureRow, styles.glassPanel]} onPress={() => setShowOptions(true)} accessibilityRole="button">
          <View style={styles.departureIcon}><Ionicons name="time-outline" size={18} color={colors.navy} /></View>
          <View style={styles.departureCopy}>
            <Text style={styles.departureLabel}>検索条件</Text>
            <Text style={styles.departureValue}>{hydrated ? (selectedDate ? <>{selectedDate.getMonth() + 1}/{selectedDate.getDate()}<Text style={{ color: weekdayColor(selectedDate, colors) }}>({"日月火水木金土"[selectedDate.getDay()]})</Text> {timeText} {timeMode === "arrival" ? "到着" : "出発"}</> : `${timeText} ${timeMode === "arrival" ? "到着" : "出発"}`) : ""}</Text>
          </View>
          <Text style={styles.changeText}>変更</Text>
          <Ionicons name="chevron-forward" size={17} color={colors.lightMuted} />
        </MicroPressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <MicroPressable style={[styles.primaryButton, isSearching && styles.primaryButtonLoading]} onPress={runSearch} disabled={isSearching} accessibilityRole="button" accessibilityState={{ busy: isSearching }}>
          {isSearching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <View style={styles.searchIconTile}><Ionicons name="train-outline" size={17} color="#FFFFFF" /></View>}
          <Text style={styles.primaryButtonText}>{isSearching ? "時刻表を読み込み中..." : "検索"}</Text>
        </MicroPressable>

        {route && routeOptions ? (
          <ResultPanel
            key={`${route.origin}|${route.destination}|${route.actualDepartureMinutes}|${route.arrivalMinutes}|${alternativeIndex}`}
            route={route}
            routeOptions={routeOptions}
            preference={routePreference}
            onSelectPreference={(value) => { setRoutePreference(value); setShowDetails(false); }}
            transferAlternatives={transferAlternatives}
            alternativeIndex={alternativeIndex}
            onSelectAlternative={(index) => { setAlternativeIndex(index); setShowDetails(false); }}
            detailsOpen={showDetails}
            onToggleDetails={() => { hapticSelection(); setShowDetails((value) => !value); }}
          />
        ) : null}

        {searchHistory.length > 0 && (
          <View style={[styles.historyPanel, styles.glassPanel]}>
            <View style={styles.historyHeader}>
              <View style={styles.historyTitleWrap}><Ionicons name="time-outline" size={15} color={colors.teal} /><Text style={styles.historyTitle}>最近の検索</Text></View>
            </View>
            {searchHistory.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <MicroPressable style={[styles.historyEntry, highlightedHistoryId === entry.id && styles.historyEntryHighlighted]} onPress={() => pressHistory(entry)} accessibilityRole="button" accessibilityLabel={`${entry.origin}から${entry.destination}の検索条件を使う`}>
                  <View style={styles.historyRouteIcon}><Ionicons name="arrow-forward" size={13} color={colors.navy} /></View>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyRoute}>{entry.origin} <Text style={styles.historyArrow}>→</Text> {entry.destination}</Text>
                    <Text style={styles.historyMeta}>{entry.timeText} {entry.timeMode === "arrival" ? "到着" : "出発"} · {entry.dayMode === "auto" ? "曜日を自動判定" : dayLabel(entry.dayMode)}</Text>
                  </View>
                </MicroPressable>
                <MicroPressable style={styles.historyDelete} onPress={() => removeHistory(entry.id)} accessibilityRole="button" accessibilityLabel={`${entry.origin}から${entry.destination}の履歴を削除`}>
                  <Ionicons name="close" size={16} color={colors.muted} />
                </MicroPressable>
              </View>
            ))}
          </View>
        )}


        <MicroPressable style={styles.dataRow} onPress={() => setShowDataInfo((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: showDataInfo }}>
          <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
          <Text style={styles.dataRowText}>データ基準日</Text>
          <Ionicons name={showDataInfo ? "chevron-up" : "chevron-down"} size={17} color={colors.muted} />
        </MicroPressable>
        {showDataInfo && (
          <View style={styles.dataDetail}>
            <Text style={styles.dataRevisionText}>{revisionDates}</Text>
            <Text style={styles.dataPrivacyText}>検索履歴はこの端末に保存されます</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showCacheClearDialog} transparent animationType="fade" onRequestClose={() => !isClearingCache && setShowCacheClearDialog(false)}>
        <View style={styles.dialogBackdrop}>
          <View style={styles.cacheDialog} accessibilityViewIsModal>
            <View style={styles.cacheDialogIcon}><Ionicons name="refresh" size={22} color={colors.navy} /></View>
            <Text style={styles.cacheDialogTitle}>キャッシュをクリアしますか？</Text>
            <Text style={styles.cacheDialogText}>最新のアプリを読み込みます。検索履歴は削除されません。</Text>
            <Text style={styles.cacheDialogHint}>通信できる状態で実行してください。</Text>
            <View style={styles.cacheDialogActions}>
              <MicroPressable style={styles.cacheDialogCancel} onPress={() => setShowCacheClearDialog(false)} disabled={isClearingCache} accessibilityRole="button"><Text style={styles.cacheDialogCancelText}>キャンセル</Text></MicroPressable>
              <MicroPressable style={[styles.cacheDialogConfirm, isClearingCache && styles.cacheDialogConfirmDisabled]} onPress={clearAppCacheAndReload} disabled={isClearingCache} accessibilityRole="button" accessibilityState={{ busy: isClearingCache }}>
                {isClearingCache ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.cacheDialogConfirmText}>クリアして更新</Text>}
              </MicroPressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerField !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerField(null)}>
        <SafeAreaView style={styles.sheetScreen}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetOverline}>{pickerField === "origin" ? "出発" : "到着"}</Text>
              <Text style={styles.sheetTitle}>駅を選択</Text>
            </View>
            <MicroPressable style={styles.sheetClose} onPress={() => setPickerField(null)} accessibilityRole="button" accessibilityLabel="駅選択を閉じる"><Ionicons name="close" size={21} color={colors.ink} /></MicroPressable>
          </View>
          <View style={styles.stationSearch}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={stationQuery} onChangeText={setStationQuery} placeholder="駅名を入力" placeholderTextColor={colors.lightMuted} style={styles.stationSearchInput} autoFocus />
          </View>
          <StationKindSegments value={stationKindFilter} onChange={selectStationKindFilter} />
          {stationKindFilter !== "bus" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.lineFilterScroll} contentContainerStyle={styles.lineFilterContent} keyboardShouldPersistTaps="handled">
              <MicroPressable style={[styles.lineFilterChip, stationLineFilter === "all" && styles.lineFilterChipActive]} onPress={() => setStationLineFilter("all")} accessibilityRole="button" accessibilityState={{ selected: stationLineFilter === "all" }}><Text style={[styles.lineFilterText, stationLineFilter === "all" && styles.lineFilterTextActive]}>すべて</Text></MicroPressable>
              {SUBWAY_LINES.map((line) => {
                const active = stationLineFilter === line.id;
                return <MicroPressable key={line.id} style={[styles.lineFilterChip, active && { borderColor: line.color, backgroundColor: `${line.color}18` }]} onPress={() => setStationLineFilter(line.id)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${line.name}で絞り込む`}><View style={[styles.lineFilterDot, { backgroundColor: line.color }]} /><Text style={[styles.lineFilterText, active && { color: colors.ink }]}>{line.name}</Text></MicroPressable>;
              })}
            </ScrollView>
          )}
          <Text style={styles.stationCount}>{stationMatches.length} 駅を表示</Text>
          <FlatList
            data={stationMatches}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.stationList}
            renderItem={({ item }) => {
              const stationLines = getLinesForStation(item).filter((line) => !isWalkConnector(line.id));
              // バスは系統ごとに路線扱いで名前が系統コードのため、路線名には含めず「バス」とまとめる。
              const railNames = Array.from(new Set(stationLines.filter((line) => !isBusLine(line.id)).map((line) => line.name)));
              const lineNames = stationLines.some((line) => isBusLine(line.id)) ? [...railNames, "バス"] : railNames;
              const lineSummary = lineNames.length > 3 ? `${lineNames.slice(0, 3).join("・")}・ほか${lineNames.length - 3}路線` : lineNames.join("・");
              const dotColor = stationLines.find((line) => !isBusLine(line.id) && !isMeitetsuLine(line.id))?.color ?? stationLines[0]?.color ?? colors.teal;
              return (
                <MicroPressable style={[styles.stationOption, highlightedStation === item && styles.stationOptionHighlighted]} onPress={() => pressStation(item)} accessibilityRole="button" accessibilityLabel={lineSummary ? `${item}、${lineSummary}` : item}>
                  <View style={[styles.stationOptionDot, { backgroundColor: dotColor }]} />
                  <View style={styles.stationOptionCopy}>
                    <Text style={styles.stationOptionText}>{item}</Text>
                    {lineSummary ? <Text style={styles.stationOptionLines}>{lineSummary}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.lightMuted} />
                </MicroPressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyStationText}>該当する駅がありません。</Text>}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={showOptions} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowOptions(false)}>
        <SafeAreaView style={styles.sheetScreen}>
          <View style={styles.sheetHeader}>
            <View><Text style={styles.sheetOverline}>検索条件</Text><Text style={styles.sheetTitle}>{timeMode === "arrival" ? "到着日時" : "出発日時"}</Text></View>
            <MicroPressable style={styles.sheetClose} onPress={() => setShowOptions(false)} accessibilityRole="button" accessibilityLabel="検索条件を閉じる"><Ionicons name="close" size={21} color={colors.ink} /></MicroPressable>
          </View>
          <MicroPressable style={styles.nowButton} onPress={useNow} accessibilityRole="button"><Ionicons name="locate-outline" size={17} color={colors.teal} /><Text style={styles.nowButtonText}>いまの時刻に戻す</Text></MicroPressable>
          <View style={styles.optionSection}>
            <Text style={styles.optionLabel}>時刻の基準</Text>
            <View style={styles.segmented}>
              {([ ["departure", "出発時刻で検索"], ["arrival", "到着時刻で検索"] ] as const).map(([value, label]) => (
                <MicroPressable key={value} style={[styles.segment, timeMode === value && styles.segmentActive]} onPress={() => setTimeMode(value)}>
                  <Text style={[styles.segmentText, timeMode === value && styles.segmentTextActive]}>{label}</Text>
                </MicroPressable>
              ))}
            </View>
          </View>
          <View style={styles.optionSection}>
            <Text style={styles.optionLabel}>日付</Text>
            <DateTimeField kind="date" value={dateText} onChange={setDateText} />
          </View>
          <View style={styles.optionSection}>
            <Text style={styles.optionLabel}>{timeMode === "arrival" ? "到着時刻" : "出発時刻"}</Text>
            <DateTimeField kind="time" value={timeText} onChange={setTimeText} />
          </View>
          <View style={styles.optionSection}>
            <View style={styles.optionHeading}><Text style={styles.optionLabel}>時刻表の種別</Text><Text style={styles.autoText}>自動: {dayLabel(automaticDayType)}{automaticHolidayName ? `(${automaticHolidayName})` : ""}</Text></View>
            <View style={styles.segmented}>{([ ["auto", "自動"], ["weekday", "平日"], ["holiday", "土休日"] ] as const).map(([value, label]) => <MicroPressable key={value} style={[styles.segment, dayMode === value && styles.segmentActive]} onPress={() => setDayMode(value)}><Text style={[styles.segmentText, dayMode === value && styles.segmentTextActive]}>{label}</Text></MicroPressable>)}</View>
            <Text style={styles.optionHint}>祝日・振替休日も自動で「土休日」として判定します。</Text>
          </View>
          <MicroPressable style={styles.applyButton} onPress={() => setShowOptions(false)} accessibilityRole="button"><Text style={styles.applyButtonText}>完了</Text></MicroPressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(C: typeof COLORS) {
  return StyleSheet.create({
  appText: { fontFamily: "NotoSansJP", fontWeight: "400", letterSpacing: 0 },
  safeArea: { flex: 1, backgroundColor: C.canvas }, content: { padding: 20, paddingBottom: 42 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, brandLockup: { flexDirection: "row", alignItems: "center", gap: 8 }, brandMark: { width: 34, height: 34, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(18,117,187,0.28)", shadowColor: "#1B75BB", shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, brandIcon: { width: "100%", height: "100%" }, brandName: { color: C.ink, fontWeight: "800", fontSize: 14 }, topActions: { flexDirection: "row", alignItems: "center", gap: 7 }, cacheRefreshButton: { width: 32, height: 32, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: C.glass, borderWidth: 1, borderColor: "rgba(18,117,187,0.18)" }, offlineStatus: { flexDirection: "row", alignItems: "center", gap: 4 }, offlineText: { color: C.muted, fontSize: 11, fontWeight: "700" },
  intro: { marginTop: 30, marginBottom: 22 }, introEyebrow: { color: C.teal, fontSize: 13, fontWeight: "800" }, introTitle: { color: C.ink, fontSize: 31, lineHeight: 39, fontWeight: "800", marginTop: 4, letterSpacing: -0.6 }, introHint: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  glassPanel: { backgroundColor: C.glass, borderColor: "rgba(18,117,187,0.16)", shadowColor: "#1B75BB", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, routeCard: { position: "relative", borderWidth: 1, borderColor: C.border, borderRadius: 18, backgroundColor: C.surface, padding: 10 }, routeFields: { gap: 0 }, routeFieldRow: { minHeight: 60, flexDirection: "row", alignItems: "center" }, routeField: { flex: 1, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 7 }, fieldInlineClear: { width: 34, height: 34, marginRight: 4, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(11,91,149,0.06)" }, routeFieldCopy: { flex: 1 }, routeLabel: { color: C.muted, fontSize: 11, fontWeight: "700" }, routeValue: { color: C.ink, fontSize: 17, fontWeight: "800", marginTop: 2 }, routePlaceholder: { color: C.lightMuted, fontWeight: "600" }, marker: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border, overflow: "hidden" }, originMarker: { backgroundColor: C.surface }, destinationMarker: { backgroundColor: C.surface }, markerInnerDot: { position: "absolute", top: 6, left: 6, width: 16, height: 16, borderRadius: 8 }, splitMarker: { borderColor: "transparent" }, markerDiagonalBase: { position: "absolute", top: 0, left: 0, width: 30, height: 30 }, markerDiagonalOverlay: { position: "absolute", top: 0, left: 0, width: 30, height: 30 }, markerIconBadge: { position: "absolute", top: 6, left: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border }, markerBusRing: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BUS_LINE_COLOR, alignItems: "center", justifyContent: "center" }, routeConnectorRow: { height: 8, paddingLeft: 21 }, routeConnector: { height: 8, borderLeftWidth: 2, borderLeftColor: "rgba(18,117,187,0.16)" }, swapButton: { position: "absolute", left: 17, top: 59, width: 30, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: "rgba(18,117,187,0.22)" },
  departureRow: { marginTop: 13, minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, departureIcon: { width: 31, height: 31, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,150,210,0.11)", borderWidth: 1, borderColor: "rgba(31,150,210,0.18)" }, departureCopy: { flex: 1 }, departureLabel: { color: C.muted, fontSize: 11, fontWeight: "700" }, departureValue: { color: C.ink, fontSize: 14, fontWeight: "800", marginTop: 2 }, changeText: { color: C.blue, fontSize: 12, fontWeight: "800" }, historyPanel: { marginTop: 13, borderRadius: 16, padding: 10 }, historyHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 6 }, historyTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 }, historyTitle: { color: C.ink, fontSize: 12, fontWeight: "800" }, historyRow: { minHeight: 48, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(18,117,187,0.09)" }, historyEntry: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }, historyRouteIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(11,91,149,0.08)" }, historyEntryHighlighted: { backgroundColor: "rgba(11,91,149,0.08)", borderRadius: 12 }, historyCopy: { flex: 1 }, historyRoute: { color: C.ink, fontSize: 13, fontWeight: "700" }, historyArrow: { color: C.teal }, historyMeta: { color: C.muted, fontSize: 10, marginTop: 1 }, historyDelete: { width: 34, height: 34, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  errorText: { color: C.danger, marginTop: 12, fontSize: 12, fontWeight: "700" }, primaryButton: { minHeight: 56, borderRadius: 18, marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: C.navy, shadowColor: "#1B75BB", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, primaryButtonLoading: { opacity: 0.78 }, searchIconTile: { width: 28, height: 28, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#1B75BB", borderWidth: 1, borderColor: "rgba(245,196,0,0.72)" }, primaryButtonText: { color: C.surface, fontSize: 16, fontWeight: "800" },
  searchHint: { marginTop: 14, color: C.muted, fontSize: 11, textAlign: "center" },
  resultArea: { marginTop: 28 }, routePreferenceGroup: { flexDirection: "row", padding: 3, borderRadius: 16, marginBottom: 15 }, routePreferenceButton: { flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderRadius: 14 }, routePreferencePill: { position: "absolute", top: 3, bottom: 3, left: 3, borderRadius: 14, backgroundColor: "rgba(11,91,149,0.09)", borderWidth: 1, borderColor: "rgba(11,91,149,0.24)" }, routePreferenceLabel: { color: C.muted, fontSize: 13, fontWeight: "800" }, routePreferenceLabelActive: { color: C.navy }, routePreferenceMeta: { color: C.ink, fontSize: 12, fontWeight: "700", marginTop: 2 }, routePreferenceMetaActive: { color: C.navy }, routePreferenceHint: { color: C.muted, fontSize: 9, marginTop: 2 }, routePreferenceHintActive: { color: C.teal }, alternativeGroup: { flexDirection: "row", gap: 8, marginBottom: 12 }, alternativeChip: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }, alternativeChipActive: { borderColor: C.navy, backgroundColor: "rgba(11,91,149,0.08)" }, alternativeChipText: { color: C.muted, fontSize: 12, fontWeight: "700" }, alternativeChipTextActive: { color: C.navy }, resultOverline: { color: C.overline, fontSize: 12, fontWeight: "800", marginBottom: 9 }, resultHero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }, resultDeparture: { color: C.ink, fontSize: 29, lineHeight: 33, fontWeight: "800", letterSpacing: -0.7 }, resultArrival: { color: C.ink, fontSize: 29, lineHeight: 33, fontWeight: "800", textAlign: "right", letterSpacing: -0.7 }, resultPlace: { color: C.muted, fontSize: 13, fontWeight: "700", marginTop: 3 }, resultArrowWrap: { alignItems: "center", gap: 1 }, resultDuration: { color: C.navy, fontSize: 13, fontWeight: "800" }, resultTransfer: { color: C.muted, fontSize: 11, fontWeight: "700" }, resultFare: { color: C.navy, fontSize: 12, fontWeight: "800", marginTop: 1 }, resultArrivalWrap: { alignItems: "flex-end" }, routeSteps: { marginTop: 18, gap: 8 }, routeLegSummary: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, routeLegColor: { width: 4, alignSelf: "stretch", borderRadius: 3 }, routeLegCopy: { flex: 1 }, routeLegHeading: { flexDirection: "row", alignItems: "center", gap: 8 }, linePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 }, linePillText: { fontSize: 11, fontWeight: "800" }, routeLegDirection: { flex: 1, color: C.ink, fontSize: 14, fontWeight: "800" }, routeLegMeta: { color: C.muted, fontSize: 11, marginTop: 5 }, routeTransferSummary: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, backgroundColor: C.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border }, routeTransferText: { flex: 1, color: C.muted, fontSize: 11, fontWeight: "700" }, walkLegSummary: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 15, backgroundColor: "rgba(36,110,141,0.06)", borderWidth: 1, borderColor: "rgba(36,110,141,0.18)", borderStyle: "dashed" }, walkLegText: { flex: 1, color: C.teal, fontSize: 12, fontWeight: "700" }, detailToggle: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 8 }, detailToggleText: { color: C.navy, fontSize: 13, fontWeight: "800" },
  detailList: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }, detailLeg: { flexDirection: "row", minHeight: 72, gap: 9 }, detailLine: { width: 4, borderRadius: 2 }, detailLineWalk: { backgroundColor: C.lightMuted }, detailTimes: { justifyContent: "space-between", paddingVertical: 1 }, detailTime: { color: C.ink, fontSize: 13, fontWeight: "800" }, detailCopy: { flex: 1, justifyContent: "space-between", paddingBottom: 2 }, detailStation: { color: C.ink, fontSize: 14, fontWeight: "800" }, detailDirection: { color: C.muted, fontSize: 11 }, detailTransfer: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 8 }, detailConnector: { width: 4, height: 14, borderRadius: 2, backgroundColor: C.amber }, detailTransferText: { color: C.transferText, fontSize: 11, fontWeight: "700" }, detailFooter: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, flexDirection: "row", justifyContent: "space-between" }, detailFooterText: { color: C.muted, fontSize: 11, fontWeight: "700" },
  dataRow: { marginTop: 27, minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8 }, dataRowText: { flex: 1, color: C.muted, fontSize: 12, fontWeight: "700" }, dataDetail: { paddingTop: 3, paddingBottom: 3 }, dataRevisionText: { color: C.navy, fontSize: 10, lineHeight: 15, marginVertical: 8, fontWeight: "700" }, dataPrivacyText: { color: C.muted, fontSize: 10, lineHeight: 15 }, dialogBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(18,27,35,0.28)" }, cacheDialog: { width: "100%", maxWidth: 360, padding: 22, borderRadius: 22, alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: "rgba(18,117,187,0.16)", shadowColor: "#0B5B95", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 }, cacheDialogIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(11,91,149,0.09)" }, cacheDialogTitle: { color: C.ink, fontSize: 18, fontWeight: "800", marginTop: 14 }, cacheDialogText: { color: C.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 }, cacheDialogHint: { color: C.lightMuted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 }, cacheDialogActions: { width: "100%", flexDirection: "row", gap: 9, marginTop: 21 }, cacheDialogCancel: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, cacheDialogCancelText: { color: C.muted, fontSize: 13, fontWeight: "800" }, cacheDialogConfirm: { flex: 1.35, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.navy }, cacheDialogConfirmDisabled: { opacity: 0.7 }, cacheDialogConfirmText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  sheetScreen: { flex: 1, backgroundColor: C.canvas }, sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 17, backgroundColor: C.surface }, sheetOverline: { color: C.teal, fontSize: 11, fontWeight: "800" }, sheetTitle: { color: C.ink, fontSize: 24, fontWeight: "800", marginTop: 3 }, sheetClose: { width: 38, height: 38, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: C.elevated }, stationKindSegmented: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, padding: 3, gap: 3, borderRadius: 15, backgroundColor: "rgba(11,91,149,0.07)", borderWidth: 1, borderColor: "rgba(11,91,149,0.16)" }, stationKindSegment: { flex: 1, height: 36, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, stationKindPill: { position: "absolute", top: 3, bottom: 3, left: 3, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: "rgba(11,91,149,0.28)" }, stationKindSegmentText: { color: C.muted, fontSize: 12, fontWeight: "700" }, stationKindSegmentTextActive: { color: C.navy }, stationSearch: { margin: 16, minHeight: 50, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, stationSearchInput: { flex: 1, color: C.ink, fontFamily: "NotoSansJP", fontSize: 15, paddingVertical: 9 }, lineFilterScroll: { height: 42, flexGrow: 0, flexShrink: 0, marginBottom: 8 }, lineFilterContent: { paddingHorizontal: 16, gap: 8 }, lineFilterChip: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }, lineFilterChipActive: { borderColor: C.navy, backgroundColor: "rgba(11,91,149,0.08)" }, lineFilterDot: { width: 7, height: 7, borderRadius: 4 }, lineFilterText: { color: C.muted, fontSize: 11, fontWeight: "700" }, lineFilterTextActive: { color: C.navy }, stationCount: { color: C.muted, marginHorizontal: 20, marginBottom: 7, fontSize: 12 }, stationList: { paddingHorizontal: 16, paddingBottom: 28 }, stationOption: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }, stationOptionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal }, stationOptionHighlighted: { backgroundColor: "rgba(11,91,149,0.08)" }, stationOptionCopy: { flex: 1 }, stationOptionText: { color: C.ink, fontSize: 16, fontWeight: "700" }, stationOptionLines: { color: C.muted, fontSize: 11, fontWeight: "600", marginTop: 1 }, emptyStationText: { color: C.muted, textAlign: "center", padding: 30 },
  nowButton: { alignSelf: "flex-start", margin: 20, marginBottom: 7, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, nowButtonText: { color: C.muted, fontSize: 13, fontWeight: "800" }, optionSection: { marginHorizontal: 20, marginTop: 18 }, optionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, optionLabel: { color: C.ink, fontSize: 13, fontWeight: "800" }, autoText: { color: C.muted, fontSize: 11, fontWeight: "800" }, optionInput: { minHeight: 50, marginTop: 9, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, optionTextInput: { flex: 1, color: C.ink, fontFamily: "NotoSansJP", fontSize: 15, fontWeight: "700", paddingVertical: 8 }, segmented: { marginTop: 9, padding: 3, flexDirection: "row", borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, segment: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12 }, segmentActive: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, segmentText: { color: C.muted, fontSize: 13, fontWeight: "700" }, segmentTextActive: { color: C.navy }, optionHint: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 8 }, applyButton: { minHeight: 54, marginHorizontal: 20, marginTop: 29, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: C.navy }, applyButtonText: { color: C.surface, fontSize: 16, fontWeight: "800" },
});
}

const lightStyles = createStyles(COLORS);
const darkStyles = createStyles(DARK_COLORS);

function useAppStyles() {
  return useColorScheme() === "dark" ? darkStyles : lightStyles;
}
