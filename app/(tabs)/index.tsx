import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text as RNText, TextInput, type TextProps, type TextStyle, View } from "react-native";

import {
  ALL_STATIONS,
  MINIMUM_TRANSFER_MINUTES,
  SUBWAY_LINES,
  TIMETABLE_REVISIONS,
  findTimedRouteOptions,
  formatMinutes,
  getLineForStation,
  getServiceDayType,
  minutesFromTimeText,
} from "@/lib/subway/network";
import type { LineId, RoutePreference, ServiceDayType, TimedRoute } from "@/lib/subway/types";
import { loadSearchHistory, mergeSearchHistory, saveSearchHistory, type SearchHistoryEntry } from "@/lib/subway/search-history";

type StationField = "origin" | "destination";
type DayMode = "auto" | ServiceDayType;
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
} as const;

function Text({ style, ...props }: TextProps) {
  const originalWeight = StyleSheet.flatten(style)?.fontWeight;
  const reducedWeight = REDUCED_FONT_WEIGHTS[String(originalWeight)];

  return <RNText {...props} style={[styles.appText, style, reducedWeight ? { fontWeight: reducedWeight } : undefined]} />;
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

function dateLabel(date: Date | null, time: string) {
  if (!date) return `${time} 出発`;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday ? `${time} 出発・きょう` : `${date.getMonth() + 1}/${date.getDate()} ${time} 出発`;
}

function StationMarker({ type, station, preferredLineId }: { type: StationField; station: string; preferredLineId?: LineId }) {
  const line = type === "origin" ? getLineForStation(station, preferredLineId) : undefined;

  return (
    <View style={[styles.marker, type === "origin" ? styles.originMarker : styles.destinationMarker, line && { backgroundColor: line.color, borderColor: line.color }]}>
      <Ionicons name={type === "origin" ? "radio-button-on" : "location"} size={17} color={line?.textColor ?? COLORS.ink} />
    </View>
  );
}

function ResultPanel({
  route,
  routeOptions,
  preference,
  onSelectPreference,
  detailsOpen,
  onToggleDetails,
}: {
  route: TimedRoute;
  routeOptions: RouteOptions;
  preference: RoutePreference;
  onSelectPreference: (preference: RoutePreference) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const destinationLeg = route.legs[route.legs.length - 1];
  const choices = ([
    ["fastest", "最短", "到着時刻を優先"],
    ["fewestTransfers", "乗換少なめ", "乗換回数を優先"],
  ] as const).filter(([value]) => routeOptions[value]);

  return (
    <View style={styles.resultArea}>
      <View style={[styles.routePreferenceGroup, styles.glassPanel]} accessibilityRole="tablist">
        {choices.map(([value, label, detail]) => {
          const candidate = routeOptions[value];
          if (!candidate) return null;
          const isActive = preference === value;
          return (
            <Pressable
              key={value}
              style={[styles.routePreferenceButton, isActive && styles.routePreferenceButtonActive]}
              onPress={() => onSelectPreference(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${label}、${candidate.totalMinutes}分、${candidate.transferCount === 0 ? "乗換なし" : `乗換${candidate.transferCount}回`}`}
            >
              <Text style={[styles.routePreferenceLabel, isActive && styles.routePreferenceLabelActive]}>{label}</Text>
              <Text style={[styles.routePreferenceMeta, isActive && styles.routePreferenceMetaActive]}>{candidate.totalMinutes}分 · {candidate.transferCount === 0 ? "乗換なし" : `${candidate.transferCount}回`}</Text>
              <Text style={[styles.routePreferenceHint, isActive && styles.routePreferenceHintActive]}>{detail}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.resultOverline}>{preference === "fastest" ? "最短の経路" : "乗換少なめの経路"}</Text>
      <View style={styles.resultHero}>
        <View>
          <Text style={styles.resultDeparture}>{formatMinutes(route.actualDepartureMinutes)}</Text>
          <Text style={styles.resultPlace}>{route.origin}</Text>
        </View>
        <View style={styles.resultArrowWrap}>
          <Text style={styles.resultDuration}>{route.totalMinutes}分</Text>
          <Ionicons name="arrow-forward" size={22} color={COLORS.navy} />
          <Text style={styles.resultTransfer}>{route.transferCount === 0 ? "乗換なし" : `乗換 ${route.transferCount}回`}</Text>
        </View>
        <View style={styles.resultArrivalWrap}>
          <Text style={styles.resultArrival}>{formatMinutes(route.arrivalMinutes)}</Text>
          <Text style={styles.resultPlace}>{route.destination}</Text>
        </View>
      </View>

      <View style={styles.routeSteps}>
        {route.legs.map((leg, index) => {
          const nextLeg = route.legs[index + 1];
          return (
            <View key={`${leg.lineId}-${leg.boardStation}-${leg.alightStation}-${index}`}>
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
                <Ionicons name="train-outline" size={20} color={COLORS.navy} />
              </View>
              {nextLeg && (
                <View style={[styles.routeTransferSummary, styles.glassPanel]}>
                  <Ionicons name="walk-outline" size={16} color={COLORS.muted} />
                  <Text style={styles.routeTransferText}>{leg.alightStation}で{nextLeg.lineName}へ乗換 · 推奨最小 {nextLeg.transferMinutes}分</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <Pressable style={styles.detailToggle} onPress={onToggleDetails} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}>
        <Text style={styles.detailToggleText}>{detailsOpen ? "経路詳細を閉じる" : "経路の詳細を見る"}</Text>
        <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.navy} />
      </Pressable>

      {detailsOpen && (
        <View style={styles.detailList}>
          {route.legs.map((leg, index) => (
            <View key={`${leg.lineId}-${leg.boardStation}-${leg.alightStation}-${index}`}>
              {index > 0 && (
                <View style={styles.detailTransfer}>
                  <View style={styles.detailConnector} />
                  <Text style={styles.detailTransferText}>{leg.boardStation}で乗換・推奨最小 {leg.transferMinutes} 分</Text>
                </View>
              )}
              <View style={styles.detailLeg}>
                <View style={[styles.detailLine, { backgroundColor: leg.lineColor }]} />
                <View style={styles.detailTimes}>
                  <Text style={styles.detailTime}>{formatMinutes(leg.departureMinutes)}</Text>
                  <Text style={styles.detailTime}>{formatMinutes(leg.arrivalMinutes)}</Text>
                </View>
                <View style={styles.detailCopy}>
                  <Text style={styles.detailStation}>{leg.boardStation}</Text>
                  <Text style={styles.detailDirection}>{leg.lineName}・{leg.directionLabel}・乗車 {leg.rideMinutes}分</Text>
                  <Text style={styles.detailStation}>{leg.alightStation}</Text>
                </View>
              </View>
            </View>
          ))}
          <View style={styles.detailFooter}>
            <Text style={styles.detailFooterText}>運賃 {route.fare}円 · 距離 {route.distanceKm.toFixed(1)} km</Text>
            <Text style={styles.detailFooterText}>最終区間 {destinationLeg.lineName}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const initialNow = useMemo(() => new Date(), []);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [dateText, setDateText] = useState(formatDateInput(initialNow));
  const [timeText, setTimeText] = useState(formatTimeInput(initialNow));
  const [dayMode, setDayMode] = useState<DayMode>("auto");
  const [pickerField, setPickerField] = useState<StationField | null>(null);
  const [stationQuery, setStationQuery] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showDataInfo, setShowDataInfo] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOptions | null>(null);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("fastest");
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const selectedDate = parseDateInput(dateText);
  const automaticDayType = selectedDate ? getServiceDayType(selectedDate) : "weekday";
  const serviceDayType: ServiceDayType = dayMode === "auto" ? automaticDayType : dayMode;
  const stationMatches = useMemo(() => {
    const query = stationQuery.trim().toLocaleLowerCase("ja");
    return (query ? ALL_STATIONS.filter((station) => station.toLocaleLowerCase("ja").includes(query)) : ALL_STATIONS).slice(0, 32);
  }, [stationQuery]);
  const revisionText = SUBWAY_LINES.map((line) => `${line.name} ${TIMETABLE_REVISIONS[line.id]}`).join(" · ");
  const route = routeOptions?.[routePreference] ?? routeOptions?.fastest ?? routeOptions?.fewestTransfers ?? null;

  useEffect(() => {
    setSearchHistory(loadSearchHistory());
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (historyLoaded) saveSearchHistory(searchHistory);
  }, [historyLoaded, searchHistory]);

  function openStationPicker(field: StationField) {
    setPickerField(field);
    setStationQuery(field === "origin" ? origin : destination);
  }

  function selectStation(station: string) {
    if (pickerField === "origin") setOrigin(station);
    if (pickerField === "destination") setDestination(station);
    setPickerField(null);
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
    setRouteOptions(null);
    setShowDetails(false);
    setError("");
  }

  function removeHistory(id: string) {
    setSearchHistory((current) => current.filter((entry) => entry.id !== id));
  }

  async function runSearch() {
    setError("");
    setRouteOptions(null);
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
    const departureMinutes = minutesFromTimeText(timeText);
    if (departureMinutes === null || departureMinutes < 0 || departureMinutes >= 1440) {
      setError("出発時刻は 00:00〜23:59 で入力してください。");
      return;
    }
    setIsSearching(true);
    try {
      const nextOptions = await findTimedRouteOptions({ origin, destination, departureMinutes, dayType: serviceDayType });
      const nextRoute = nextOptions.fastest ?? nextOptions.fewestTransfers;
      if (!nextRoute) {
        setError("指定時刻以降に利用できる経路が見つかりませんでした。出発条件を変更してください。");
        return;
      }
      setRouteOptions(nextOptions);
      setRoutePreference(nextOptions.fastest ? "fastest" : "fewestTransfers");
      const historyEntry: SearchHistoryEntry = {
        id: `${origin}::${destination}::${dateText}::${timeText}::${dayMode}`,
        origin,
        destination,
        dateText,
        timeText,
        dayMode,
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.brandLockup}>
            <View style={styles.brandMark}><Image source={APP_ICON} style={styles.brandIcon} accessibilityLabel="名古屋市営地下鉄の乗換アイコン" /></View>
            <Text style={styles.brandName}>NAGOYA SUBWAY</Text>
          </View>
          <View style={styles.offlineStatus}>
            <Ionicons name="cloud-offline-outline" size={14} color={COLORS.teal} />
            <Text style={styles.offlineText}>オフライン</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.introTitle}>次の列車を探す</Text>
          <Text style={styles.introHint}>市営地下鉄の時刻表と乗換時間を端末内で検索します。</Text>
        </View>

        <View style={[styles.routeCard, styles.glassPanel]}>
          <View style={styles.routeFields}>
            <Pressable style={styles.routeField} onPress={() => openStationPicker("origin")} accessibilityRole="button" accessibilityLabel="出発駅を選択">
              <StationMarker type="origin" station={origin} preferredLineId={route?.origin === origin ? route.legs[0]?.lineId : undefined} />
              <View style={styles.routeFieldCopy}>
                <Text style={styles.routeLabel}>出発</Text>
                <Text style={[styles.routeValue, !origin && styles.routePlaceholder]}>{origin || "出発駅を選択"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.lightMuted} />
            </Pressable>
            <View style={styles.routeConnectorRow}><View style={styles.routeConnector} /></View>
            <Pressable style={styles.routeField} onPress={() => openStationPicker("destination")} accessibilityRole="button" accessibilityLabel="到着駅を選択">
              <StationMarker type="destination" station={destination} />
              <View style={styles.routeFieldCopy}>
                <Text style={styles.routeLabel}>到着</Text>
                <Text style={[styles.routeValue, !destination && styles.routePlaceholder]}>{destination || "到着駅を選択"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.lightMuted} />
            </Pressable>
          </View>
          <Pressable
            style={styles.swapButton}
            onPress={() => { setOrigin(destination); setDestination(origin); }}
            accessibilityRole="button"
            accessibilityLabel="出発駅と到着駅を入れ替える"
          >
            <Ionicons name="swap-vertical" size={18} color={COLORS.navy} />
          </Pressable>
        </View>

        <Pressable style={[styles.departureRow, styles.glassPanel]} onPress={() => setShowOptions(true)} accessibilityRole="button">
          <View style={styles.departureIcon}><Ionicons name="time-outline" size={18} color={COLORS.navy} /></View>
          <View style={styles.departureCopy}>
            <Text style={styles.departureLabel}>出発条件</Text>
            <Text style={styles.departureValue}>{dateLabel(selectedDate, timeText)} · {dayLabel(serviceDayType)}</Text>
          </View>
          <Text style={styles.changeText}>変更</Text>
          <Ionicons name="chevron-forward" size={17} color={COLORS.lightMuted} />
        </Pressable>

        {searchHistory.length > 0 && (
          <View style={[styles.historyPanel, styles.glassPanel]}>
            <View style={styles.historyHeader}>
              <View style={styles.historyTitleWrap}><Ionicons name="time-outline" size={15} color={COLORS.teal} /><Text style={styles.historyTitle}>最近の検索</Text></View>
              <Text style={styles.historyCaption}>この端末に保存</Text>
            </View>
            {searchHistory.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <Pressable style={styles.historyEntry} onPress={() => applyHistory(entry)} accessibilityRole="button" accessibilityLabel={`${entry.origin}から${entry.destination}の検索条件を使う`}>
                  <View style={styles.historyRouteIcon}><Ionicons name="arrow-forward" size={13} color={COLORS.navy} /></View>
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyRoute}>{entry.origin} <Text style={styles.historyArrow}>→</Text> {entry.destination}</Text>
                    <Text style={styles.historyMeta}>{entry.timeText} 出発 · {entry.dayMode === "auto" ? "曜日を自動判定" : dayLabel(entry.dayMode)}</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.historyDelete} onPress={() => removeHistory(entry.id)} accessibilityRole="button" accessibilityLabel={`${entry.origin}から${entry.destination}の履歴を削除`}>
                  <Ionicons name="close" size={16} color={COLORS.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={[styles.primaryButton, isSearching && styles.primaryButtonLoading]} onPress={runSearch} disabled={isSearching} accessibilityRole="button" accessibilityState={{ busy: isSearching }}>
          {isSearching ? <ActivityIndicator size="small" color="#FFFFFF" /> : <View style={styles.searchIconTile}><Ionicons name="train-outline" size={17} color="#FFFFFF" /></View>}
          <Text style={styles.primaryButtonText}>{isSearching ? "時刻表を読み込み中..." : "次の列車を探す"}</Text>
        </Pressable>

        {route && routeOptions ? <ResultPanel route={route} routeOptions={routeOptions} preference={routePreference} onSelectPreference={(value) => { setRoutePreference(value); setShowDetails(false); }} detailsOpen={showDetails} onToggleDetails={() => setShowDetails((value) => !value)} /> : (
          <View style={[styles.emptyHint, styles.glassPanel]}>
            <Ionicons name="train-outline" size={22} color={COLORS.teal} />
            <View style={styles.emptyHintCopy}>
              <Text style={styles.emptyHintTitle}>駅を選ぶと、次に乗れる経路を表示します</Text>
              <Text style={styles.emptyHintText}>乗換には駅・路線ごとの推奨最小時間を見込みます。</Text>
            </View>
          </View>
        )}

        <Pressable style={styles.dataRow} onPress={() => setShowDataInfo((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: showDataInfo }}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.muted} />
          <Text style={styles.dataRowText}>データ基準日</Text>
          <Ionicons name={showDataInfo ? "chevron-up" : "chevron-down"} size={17} color={COLORS.muted} />
        </Pressable>
        {showDataInfo && (
          <View style={styles.dataDetail}>
            <Text style={styles.dataDetailText}>名古屋市オープンデータ「地下鉄駅別ポケット時刻表」を加工して利用しています。リアルタイム運行情報や臨時ダイヤは反映されません。</Text>
            <Text style={styles.dataRevisionText}>路線別基準日: {revisionText}</Text>
            <Text style={styles.dataDetailText}>乗換は駅・路線の組合せごとに推奨最小時間を設定し、未設定の組合せは {MINIMUM_TRANSFER_MINUTES} 分を見込みます。</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={pickerField !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerField(null)}>
        <SafeAreaView style={styles.sheetScreen}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetOverline}>{pickerField === "origin" ? "出発" : "到着"}</Text>
              <Text style={styles.sheetTitle}>駅を選択</Text>
            </View>
            <Pressable style={styles.sheetClose} onPress={() => setPickerField(null)} accessibilityRole="button" accessibilityLabel="駅選択を閉じる"><Ionicons name="close" size={21} color={COLORS.ink} /></Pressable>
          </View>
          <View style={styles.stationSearch}>
            <Ionicons name="search" size={18} color={COLORS.muted} />
            <TextInput value={stationQuery} onChangeText={setStationQuery} placeholder="駅名を入力" placeholderTextColor={COLORS.lightMuted} style={styles.stationSearchInput} autoFocus />
          </View>
          <Text style={styles.stationCount}>{stationMatches.length} 駅を表示</Text>
          <FlatList
            data={stationMatches}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.stationList}
            renderItem={({ item }) => <Pressable style={styles.stationOption} onPress={() => selectStation(item)} accessibilityRole="button"><View style={styles.stationOptionDot} /><Text style={styles.stationOptionText}>{item}</Text><Ionicons name="chevron-forward" size={17} color={COLORS.lightMuted} /></Pressable>}
            ListEmptyComponent={<Text style={styles.emptyStationText}>該当する駅がありません。</Text>}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={showOptions} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowOptions(false)}>
        <SafeAreaView style={styles.sheetScreen}>
          <View style={styles.sheetHeader}>
            <View><Text style={styles.sheetOverline}>検索条件</Text><Text style={styles.sheetTitle}>出発日時</Text></View>
            <Pressable style={styles.sheetClose} onPress={() => setShowOptions(false)} accessibilityRole="button" accessibilityLabel="出発条件を閉じる"><Ionicons name="close" size={21} color={COLORS.ink} /></Pressable>
          </View>
          <Pressable style={styles.nowButton} onPress={useNow} accessibilityRole="button"><Ionicons name="locate-outline" size={17} color={COLORS.teal} /><Text style={styles.nowButtonText}>いまの時刻に戻す</Text></Pressable>
          <View style={styles.optionSection}>
            <Text style={styles.optionLabel}>日付</Text>
            <View style={styles.optionInput}><Ionicons name="calendar-outline" size={18} color={COLORS.navy} /><TextInput value={dateText} onChangeText={setDateText} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.lightMuted} style={styles.optionTextInput} keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} /></View>
          </View>
          <View style={styles.optionSection}>
            <Text style={styles.optionLabel}>時刻</Text>
            <View style={styles.optionInput}><Ionicons name="time-outline" size={18} color={COLORS.navy} /><TextInput value={timeText} onChangeText={setTimeText} placeholder="HH:MM" placeholderTextColor={COLORS.lightMuted} style={styles.optionTextInput} keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} /></View>
          </View>
          <View style={styles.optionSection}>
            <View style={styles.optionHeading}><Text style={styles.optionLabel}>時刻表の種別</Text><Text style={styles.autoText}>自動: {dayLabel(automaticDayType)}</Text></View>
            <View style={styles.segmented}>{([ ["auto", "自動"], ["weekday", "平日"], ["holiday", "土休日"] ] as const).map(([value, label]) => <Pressable key={value} style={[styles.segment, dayMode === value && styles.segmentActive]} onPress={() => setDayMode(value)}><Text style={[styles.segmentText, dayMode === value && styles.segmentTextActive]}>{label}</Text></Pressable>)}</View>
            <Text style={styles.optionHint}>祝日は「土休日」を選択してください。</Text>
          </View>
          <Pressable style={styles.applyButton} onPress={() => setShowOptions(false)} accessibilityRole="button"><Text style={styles.applyButtonText}>条件を反映</Text></Pressable>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appText: { fontFamily: "NotoSansJP", fontWeight: "400", letterSpacing: 0 },
  safeArea: { flex: 1, backgroundColor: COLORS.canvas }, content: { padding: 20, paddingBottom: 42 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, brandLockup: { flexDirection: "row", alignItems: "center", gap: 8 }, brandMark: { width: 34, height: 34, borderRadius: 11, overflow: "hidden", borderWidth: 1, borderColor: "rgba(18,117,187,0.28)", shadowColor: "#1B75BB", shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, brandIcon: { width: "100%", height: "100%" }, brandName: { color: COLORS.ink, fontWeight: "800", fontSize: 14 }, offlineStatus: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(18,117,187,0.12)" }, offlineText: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  intro: { marginTop: 30, marginBottom: 22 }, introEyebrow: { color: COLORS.teal, fontSize: 13, fontWeight: "800" }, introTitle: { color: COLORS.ink, fontSize: 31, lineHeight: 39, fontWeight: "800", marginTop: 4, letterSpacing: -0.6 }, introHint: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  glassPanel: { backgroundColor: "rgba(255,255,255,0.82)", borderColor: "rgba(18,117,187,0.16)", shadowColor: "#1B75BB", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, routeCard: { position: "relative", borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.surface, padding: 10 }, routeFields: { gap: 0 }, routeField: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 7 }, routeFieldCopy: { flex: 1 }, routeLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" }, routeValue: { color: COLORS.ink, fontSize: 17, fontWeight: "800", marginTop: 2 }, routePlaceholder: { color: COLORS.lightMuted, fontWeight: "600" }, marker: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border }, originMarker: { backgroundColor: COLORS.surface }, destinationMarker: { backgroundColor: COLORS.surface }, routeConnectorRow: { height: 8, paddingLeft: 21 }, routeConnector: { height: 8, borderLeftWidth: 2, borderLeftColor: "rgba(18,117,187,0.16)" }, swapButton: { position: "absolute", right: 15, top: 47, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "rgba(18,117,187,0.18)" },
  departureRow: { marginTop: 13, minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, departureIcon: { width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,150,210,0.11)", borderWidth: 1, borderColor: "rgba(31,150,210,0.18)" }, departureCopy: { flex: 1 }, departureLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" }, departureValue: { color: COLORS.ink, fontSize: 14, fontWeight: "800", marginTop: 2 }, changeText: { color: COLORS.blue, fontSize: 12, fontWeight: "800" }, historyPanel: { marginTop: 13, borderRadius: 16, padding: 10 }, historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 6 }, historyTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 }, historyTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "800" }, historyCaption: { color: COLORS.muted, fontSize: 10 }, historyRow: { minHeight: 48, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(18,117,187,0.09)" }, historyEntry: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }, historyRouteIcon: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(11,91,149,0.08)" }, historyCopy: { flex: 1 }, historyRoute: { color: COLORS.ink, fontSize: 13, fontWeight: "700" }, historyArrow: { color: COLORS.teal }, historyMeta: { color: COLORS.muted, fontSize: 10, marginTop: 1 }, historyDelete: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.danger, marginTop: 12, fontSize: 12, fontWeight: "700" }, primaryButton: { minHeight: 56, borderRadius: 15, marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: COLORS.navy, shadowColor: "#1B75BB", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }, primaryButtonLoading: { opacity: 0.78 }, searchIconTile: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#1B75BB", borderWidth: 1, borderColor: "rgba(245,196,0,0.72)" }, primaryButtonText: { color: COLORS.surface, fontSize: 16, fontWeight: "800" },
  emptyHint: { marginTop: 24, flexDirection: "row", gap: 12, padding: 15, borderRadius: 17, backgroundColor: COLORS.paleTeal }, emptyHintCopy: { flex: 1 }, emptyHintTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "800", lineHeight: 19 }, emptyHintText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  resultArea: { marginTop: 28 }, routePreferenceGroup: { flexDirection: "row", padding: 3, borderRadius: 16, marginBottom: 15 }, routePreferenceButton: { flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderRadius: 13 }, routePreferenceButtonActive: { backgroundColor: "rgba(11,91,149,0.09)", borderWidth: 1, borderColor: "rgba(11,91,149,0.24)" }, routePreferenceLabel: { color: COLORS.muted, fontSize: 13, fontWeight: "800" }, routePreferenceLabelActive: { color: COLORS.navy }, routePreferenceMeta: { color: COLORS.ink, fontSize: 12, fontWeight: "700", marginTop: 2 }, routePreferenceMetaActive: { color: COLORS.navy }, routePreferenceHint: { color: COLORS.muted, fontSize: 9, marginTop: 2 }, routePreferenceHintActive: { color: COLORS.teal }, resultOverline: { color: "#5E5144", fontSize: 12, fontWeight: "800", marginBottom: 9 }, resultHero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }, resultDeparture: { color: COLORS.ink, fontSize: 29, lineHeight: 33, fontWeight: "800", letterSpacing: -0.7 }, resultArrival: { color: COLORS.ink, fontSize: 29, lineHeight: 33, fontWeight: "800", textAlign: "right", letterSpacing: -0.7 }, resultPlace: { color: COLORS.muted, fontSize: 13, fontWeight: "700", marginTop: 3 }, resultArrowWrap: { alignItems: "center", gap: 1 }, resultDuration: { color: COLORS.navy, fontSize: 13, fontWeight: "800" }, resultTransfer: { color: COLORS.muted, fontSize: 11, fontWeight: "700" }, resultArrivalWrap: { alignItems: "flex-end" }, routeSteps: { marginTop: 18, gap: 8 }, routeLegSummary: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, routeLegColor: { width: 4, alignSelf: "stretch", borderRadius: 3 }, routeLegCopy: { flex: 1 }, routeLegHeading: { flexDirection: "row", alignItems: "center", gap: 8 }, linePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 }, linePillText: { fontSize: 11, fontWeight: "800" }, routeLegDirection: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: "800" }, routeLegMeta: { color: COLORS.muted, fontSize: 11, marginTop: 5 }, routeTransferSummary: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, backgroundColor: COLORS.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border }, routeTransferText: { flex: 1, color: COLORS.muted, fontSize: 11, fontWeight: "700" }, detailToggle: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 8 }, detailToggleText: { color: COLORS.navy, fontSize: 13, fontWeight: "800" },
  detailList: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }, detailLeg: { flexDirection: "row", minHeight: 72, gap: 9 }, detailLine: { width: 4, borderRadius: 2 }, detailTimes: { justifyContent: "space-between", paddingVertical: 1 }, detailTime: { color: COLORS.ink, fontSize: 13, fontWeight: "800" }, detailCopy: { flex: 1, justifyContent: "space-between", paddingBottom: 2 }, detailStation: { color: COLORS.ink, fontSize: 14, fontWeight: "800" }, detailDirection: { color: COLORS.muted, fontSize: 11 }, detailTransfer: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 8 }, detailConnector: { width: 4, height: 14, borderRadius: 2, backgroundColor: COLORS.amber }, detailTransferText: { color: "#81510D", fontSize: 11, fontWeight: "700" }, detailFooter: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: "row", justifyContent: "space-between" }, detailFooterText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  dataRow: { marginTop: 27, minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8 }, dataRowText: { flex: 1, color: COLORS.muted, fontSize: 12, fontWeight: "700" }, dataDetail: { paddingTop: 3, paddingBottom: 3 }, dataDetailText: { color: COLORS.muted, fontSize: 11, lineHeight: 17 }, dataRevisionText: { color: COLORS.navy, fontSize: 10, lineHeight: 15, marginVertical: 8, fontWeight: "700" },
  sheetScreen: { flex: 1, backgroundColor: COLORS.canvas }, sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 17, backgroundColor: COLORS.surface }, sheetOverline: { color: COLORS.teal, fontSize: 11, fontWeight: "800" }, sheetTitle: { color: COLORS.ink, fontSize: 24, fontWeight: "800", marginTop: 3 }, sheetClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.elevated }, stationSearch: { margin: 16, minHeight: 50, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderRadius: 15, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, stationSearchInput: { flex: 1, color: COLORS.ink, fontSize: 15, paddingVertical: 9 }, stationCount: { color: COLORS.muted, marginHorizontal: 20, marginBottom: 7, fontSize: 12 }, stationList: { paddingHorizontal: 16, paddingBottom: 28 }, stationOption: { minHeight: 55, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border }, stationOptionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.teal }, stationOptionText: { flex: 1, color: COLORS.ink, fontSize: 16, fontWeight: "700" }, emptyStationText: { color: COLORS.muted, textAlign: "center", padding: 30 },
  nowButton: { alignSelf: "flex-start", margin: 20, marginBottom: 7, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, nowButtonText: { color: COLORS.muted, fontSize: 13, fontWeight: "800" }, optionSection: { marginHorizontal: 20, marginTop: 18 }, optionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, optionLabel: { color: COLORS.ink, fontSize: 13, fontWeight: "800" }, autoText: { color: COLORS.muted, fontSize: 11, fontWeight: "800" }, optionInput: { minHeight: 50, marginTop: 9, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, optionTextInput: { flex: 1, color: COLORS.ink, fontSize: 15, fontWeight: "700", paddingVertical: 8 }, segmented: { marginTop: 9, padding: 3, flexDirection: "row", borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, segment: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 11 }, segmentActive: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }, segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: "700" }, segmentTextActive: { color: COLORS.navy }, optionHint: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 8 }, applyButton: { minHeight: 54, marginHorizontal: 20, marginTop: 29, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: COLORS.navy }, applyButtonText: { color: COLORS.surface, fontSize: 16, fontWeight: "800" },
});
