import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { loadThemePreference, saveThemePreference, type EffectiveScheme, type ThemePreference } from "./theme-preference";

export type { EffectiveScheme, ThemePreference };

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  effectiveScheme: EffectiveScheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("auto");

  useEffect(() => {
    setPreferenceState(loadThemePreference());
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    saveThemePreference(next);
  };

  const effectiveScheme: EffectiveScheme = preference === "auto" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  return <ThemeContext.Provider value={{ preference, setPreference, effectiveScheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  if (context) return context;
  // プロバイダ外では端末設定に追随する既定動作にフォールバックする。
  return { preference: "auto", setPreference: () => {}, effectiveScheme: systemScheme === "dark" ? "dark" : "light" };
}
