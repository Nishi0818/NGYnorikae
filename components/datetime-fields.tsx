import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

type Props = {
  kind: "date" | "time";
  value: string;
  onChange: (value: string) => void;
};

const LIGHT = {
  ink: "#37312B",
  navy: "#0B5B95",
  muted: "#6D625A",
  border: "#ECECEC",
  surface: "#FFFFFF",
  chipBg: "rgba(11,91,149,0.06)",
  chipBorder: "rgba(11,91,149,0.12)",
  softBg: "rgba(11,91,149,0.07)",
  softBorder: "rgba(11,91,149,0.16)",
  onNavy: "#FFFFFF",
};

const DARK: typeof LIGHT = {
  ink: "#EAE3D7",
  navy: "#93B9DC",
  muted: "#ADA294",
  border: "#3B372F",
  surface: "#292622",
  chipBg: "rgba(147,185,220,0.10)",
  chipBorder: "rgba(147,185,220,0.22)",
  softBg: "rgba(147,185,220,0.10)",
  softBorder: "rgba(147,185,220,0.25)",
  onNavy: "#17212B",
};

function usePalette() {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}

function useFieldStyles() {
  return useColorScheme() === "dark" ? darkStyles : lightStyles;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }; }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: 0, minute: 0 };
}

function formatDateValue(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function displayValue(kind: "date" | "time", value: string) {
  if (kind === "time") return value;
  const { year, month, day } = parseDate(value);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${year}年${month}月${day}日(${weekday})`;
}

/**
 * 日付・時刻の選択フィールド。テキスト入力はなく、タップで開くパネルから選ぶ。
 * 時刻は「時」と「分」のチップ、日付はカレンダーから選択する。
 */
export function DateTimeField({ kind, value, onChange }: Props) {
  const styles = useFieldStyles();
  const colors = usePalette();
  const [open, setOpen] = useState(false);
  const panelProgress = useRef(new Animated.Value(0)).current;
  const parsedDate = parseDate(value);
  const [viewYear, setViewYear] = useState(parsedDate.year);
  const [viewMonth, setViewMonth] = useState(parsedDate.month);

  useEffect(() => {
    if (!open) { panelProgress.setValue(0); return; }
    const animation = Animated.timing(panelProgress, { toValue: 1, duration: 180, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [open, panelProgress]);

  const toggle = () => {
    if (!open && kind === "date") { setViewYear(parsedDate.year); setViewMonth(parsedDate.month); }
    setOpen((current) => !current);
  };

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${kind === "date" ? "日付" : "時刻"}: ${displayValue(kind, value)}`}
      >
        <Ionicons name={kind === "date" ? "calendar-outline" : "time-outline"} size={18} color={colors.navy} />
        <Text style={styles.fieldValue}>{displayValue(kind, value)}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
      </Pressable>
      {open && (
        <Animated.View style={[styles.panel, { opacity: panelProgress, transform: [{ translateY: panelProgress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] }]}>
          {kind === "time" ? <TimePanel value={value} onChange={onChange} /> : (
            <DatePanel
              value={value}
              viewYear={viewYear}
              viewMonth={viewMonth}
              onNavigate={(year, month) => { setViewYear(year); setViewMonth(month); }}
              onSelect={(next) => { onChange(next); setOpen(false); }}
            />
          )}
          <Pressable style={({ pressed }) => [styles.closeRow, pressed && styles.fieldPressed]} onPress={() => setOpen(false)} accessibilityRole="button">
            <Text style={styles.closeText}>閉じる</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

function TimePanel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const styles = useFieldStyles();
  const { hour, minute } = parseTime(value);
  const setPart = (nextHour: number, nextMinute: number) => onChange(`${pad(nextHour)}:${pad(nextMinute)}`);
  const shiftMinutes = (delta: number) => {
    const total = ((hour * 60 + minute + delta) % 1440 + 1440) % 1440;
    setPart(Math.floor(total / 60), total % 60);
  };
  return (
    <View>
      <Text style={styles.panelLabel}>時</Text>
      <View style={styles.chipGrid}>
        {Array.from({ length: 24 }, (_, h) => (
          <Pressable key={h} style={[styles.chip, h === hour && styles.chipActive]} onPress={() => setPart(h, minute)} accessibilityRole="button" accessibilityState={{ selected: h === hour }}>
            <Text style={[styles.chipText, h === hour && styles.chipTextActive]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.panelLabel}>分</Text>
      <View style={styles.chipGrid}>
        {MINUTE_STEPS.map((m) => (
          <Pressable key={m} style={[styles.chip, m === minute && styles.chipActive]} onPress={() => setPart(hour, m)} accessibilityRole="button" accessibilityState={{ selected: m === minute }}>
            <Text style={[styles.chipText, m === minute && styles.chipTextActive]}>{pad(m)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.fineRow}>
        <Pressable style={({ pressed }) => [styles.fineButton, pressed && styles.fieldPressed]} onPress={() => shiftMinutes(-1)} accessibilityRole="button">
          <Text style={styles.fineButtonText}>−1分</Text>
        </Pressable>
        <Text style={styles.fineValue}>{pad(hour)}:{pad(minute)}</Text>
        <Pressable style={({ pressed }) => [styles.fineButton, pressed && styles.fieldPressed]} onPress={() => shiftMinutes(1)} accessibilityRole="button">
          <Text style={styles.fineButtonText}>＋1分</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DatePanel({ value, viewYear, viewMonth, onNavigate, onSelect }: {
  value: string;
  viewYear: number;
  viewMonth: number;
  onNavigate: (year: number, month: number) => void;
  onSelect: (value: string) => void;
}) {
  const styles = useFieldStyles();
  const colors = usePalette();
  const selected = parseDate(value);
  const today = new Date();
  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const move = (delta: number) => {
    const next = new Date(viewYear, viewMonth - 1 + delta, 1);
    onNavigate(next.getFullYear(), next.getMonth() + 1);
  };
  return (
    <View>
      <View style={styles.monthHeader}>
        <Pressable style={({ pressed }) => [styles.monthNav, pressed && styles.fieldPressed]} onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel="前の月">
          <Ionicons name="chevron-back" size={17} color={colors.navy} />
        </Pressable>
        <Text style={styles.monthTitle}>{viewYear}年{viewMonth}月</Text>
        <Pressable style={({ pressed }) => [styles.monthNav, pressed && styles.fieldPressed]} onPress={() => move(1)} accessibilityRole="button" accessibilityLabel="次の月">
          <Ionicons name="chevron-forward" size={17} color={colors.navy} />
        </Pressable>
      </View>
      <View style={styles.weekHeader}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekHeaderText}>{weekday}</Text>)}
      </View>
      <View style={styles.dayGrid}>
        {cells.map((day, index) => {
          if (day === null) return <View key={`blank-${index}`} style={styles.dayCell} />;
          const isSelected = selected.year === viewYear && selected.month === viewMonth && selected.day === day;
          const isToday = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth && today.getDate() === day;
          return (
            <Pressable
              key={day}
              style={[styles.dayCell, isToday && styles.dayCellToday, isSelected && styles.dayCellSelected]}
              onPress={() => onSelect(formatDateValue(viewYear, viewMonth, day))}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(C: typeof LIGHT) {
  return StyleSheet.create({
    field: { minHeight: 50, marginTop: 9, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    fieldPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
    fieldValue: { flex: 1, color: C.ink, fontFamily: "NotoSansJP", fontSize: 15, fontWeight: "700", paddingVertical: 8 },
    panel: { marginTop: 8, padding: 13, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    panelLabel: { color: C.muted, fontSize: 11, fontWeight: "800", marginTop: 6, marginBottom: 7 },
    chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: { width: "15%", minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.chipBg, borderWidth: 1, borderColor: C.chipBorder },
    chipActive: { backgroundColor: C.navy, borderColor: C.navy },
    chipText: { color: C.ink, fontSize: 13, fontWeight: "700" },
    chipTextActive: { color: C.onNavy },
    fineRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
    fineButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, backgroundColor: C.softBg, borderWidth: 1, borderColor: C.softBorder },
    fineButtonText: { color: C.navy, fontSize: 12, fontWeight: "800" },
    fineValue: { flex: 1, textAlign: "center", color: C.ink, fontFamily: "NotoSansJP", fontSize: 15, fontWeight: "800" },
    monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    monthNav: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: C.softBg },
    monthTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
    weekHeader: { flexDirection: "row" },
    weekHeaderText: { width: "14.28%", textAlign: "center", color: C.muted, fontSize: 11, fontWeight: "700", paddingVertical: 4 },
    dayGrid: { flexDirection: "row", flexWrap: "wrap" },
    dayCell: { width: "14.28%", aspectRatio: 1, maxHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10 },
    dayCellToday: { borderWidth: 1, borderColor: C.navy },
    dayCellSelected: { backgroundColor: C.navy },
    dayText: { color: C.ink, fontSize: 13, fontWeight: "700" },
    dayTextSelected: { color: C.onNavy },
    closeRow: { alignSelf: "flex-end", marginTop: 10, paddingHorizontal: 10, paddingVertical: 5 },
    closeText: { color: C.navy, fontSize: 12, fontWeight: "800" },
  });
}

const lightStyles = createStyles(LIGHT);
const darkStyles = createStyles(DARK);
