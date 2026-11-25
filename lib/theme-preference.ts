/** 表示テーマの指定。autoは端末設定に追随する。 */
export type ThemePreference = "auto" | "light" | "dark";
export type EffectiveScheme = "light" | "dark";

export const THEME_PREFERENCE_STORAGE_KEY = "nagoya-subway.theme-preference.v1";

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "auto";
}

/** テーマ指定は端末内にだけ保存し、サーバーへ送信しない。 */
export function loadThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function saveThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // 保存できなくても表示は継続できるため握りつぶす。
  }
}
