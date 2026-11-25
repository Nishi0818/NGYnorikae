import { describe, expect, it } from "vitest";

import { parseThemePreference } from "../lib/theme-preference";

describe("parseThemePreference", () => {
  it("light / dark はそのまま、それ以外は auto に倒す", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("auto")).toBe("auto");
    expect(parseThemePreference(null)).toBe("auto");
    expect(parseThemePreference("")).toBe("auto");
    expect(parseThemePreference("solarized")).toBe("auto");
  });
});
