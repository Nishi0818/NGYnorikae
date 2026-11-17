import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  kind: "date" | "time";
  value: string;
  onChange: (value: string) => void;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function shiftDate(value: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const base = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

function shiftTime(value: string, minutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const total = match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  const next = ((total + minutes) % 1440 + 1440) % 1440;
  return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
}

function displayValue(kind: "date" | "time", value: string) {
  if (kind === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value;
  }
  return value;
}

/** ネイティブ向け: テキスト入力ではなく、ステッパーで日付・時刻を変える。 */
export function DateTimeField({ kind, value, onChange }: Props) {
  const step = kind === "date" ? 1 : 5;
  const unit = kind === "date" ? "日" : "分";
  const shift = (delta: number) => onChange(kind === "date" ? shiftDate(value, delta) : shiftTime(value, delta));
  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
        onPress={() => shift(-step)}
        accessibilityRole="button"
        accessibilityLabel={`${step}${unit}前へ`}
      >
        <Text style={styles.stepButtonText}>−{step}{unit}</Text>
      </Pressable>
      <Text style={styles.value}>{displayValue(kind, value)}</Text>
      <Pressable
        style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
        onPress={() => shift(step)}
        accessibilityRole="button"
        accessibilityLabel={`${step}${unit}後へ`}
      >
        <Text style={styles.stepButtonText}>＋{step}{unit}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  value: { flex: 1, textAlign: "center", color: "#17212B", fontFamily: "NotoSansJP", fontSize: 15, fontWeight: "700" },
  stepButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, backgroundColor: "rgba(11,91,149,0.07)", borderWidth: 1, borderColor: "rgba(11,91,149,0.16)" },
  stepButtonPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  stepButtonText: { color: "#0B5B95", fontSize: 12, fontWeight: "800" },
});
