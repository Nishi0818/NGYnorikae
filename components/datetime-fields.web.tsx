import { createElement, type ChangeEvent } from "react";

type Props = {
  kind: "date" | "time";
  value: string;
  onChange: (value: string) => void;
};

/** Web向け: ブラウザ標準の日付・時刻ピッカーを使う。 */
export function DateTimeField({ kind, value, onChange }: Props) {
  return createElement("input", {
    type: kind,
    value,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    "aria-label": kind === "date" ? "日付" : "時刻",
    style: {
      flex: 1,
      width: "100%",
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "NotoSansJP, sans-serif",
      fontSize: 15,
      fontWeight: 700,
      color: "#17212B",
      padding: "8px 0",
      colorScheme: "light",
    },
  });
}
