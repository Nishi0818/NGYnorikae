// ビルド後に dist/icon.png を最新のアプリアイコンで上書きする。
// PWAマニフェストが参照する /icon.png は public/ の静的コピーだと差し替え漏れが起きるため、
// 正である assets/images/icon.png（バンドル済み資産）から生成する。
import { copyFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "images", "icon.png");
const md5 = createHash("md5").update(readFileSync(source)).digest("hex");

const assetsDir = join(root, "dist", "assets", "assets", "images");
const bundled = readdirSync(assetsDir).find((name) => name === `icon.${md5}.png`);
if (!bundled) {
  console.error(`fix-dist-icon: バンドル済みアイコン icon.${md5}.png が見つかりません`);
  process.exit(1);
}

copyFileSync(join(assetsDir, bundled), join(root, "dist", "icon.png"));
console.log(`fix-dist-icon: dist/icon.png を ${bundled} で生成しました`);
