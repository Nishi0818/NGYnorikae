// 本番ビルドの生成物に対する再発防止チェック。
// - 静的書き出しにビルド時刻が焼き込まれていないこと（検索条件の時刻がズレる不具合の再発防止）
// - 画面タイトルが生成物に含まれていること
// - エントリーバンドルが存在し、サイズが上限を超えていないこと
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const html = readFileSync(join(distDir, "index.html"), "utf8");

if (/\b\d{2}:\d{2}\b/.test(html)) {
  console.error("check-dist: dist/index.html に時刻文字列が含まれています（ビルド時刻の焼き込みの疑い）");
  process.exit(1);
}

if (!html.includes("なごや乗換案内")) {
  console.error("check-dist: dist/index.html にアプリ名が見つかりません");
  process.exit(1);
}

const jsDir = join(distDir, "_expo", "static", "js", "web");
const entries = readdirSync(jsDir).filter((name) => name.startsWith("entry-") && name.endsWith(".js"));
if (entries.length === 0) {
  console.error("check-dist: エントリーバンドルが見つかりません");
  process.exit(1);
}
const totalBytes = entries.reduce((sum, name) => sum + statSync(join(jsDir, name)).size, 0);
const LIMIT_BYTES = 4 * 1024 * 1024;
if (totalBytes > LIMIT_BYTES) {
  console.error(`check-dist: エントリーバンドルが上限を超えています (${totalBytes} bytes > ${LIMIT_BYTES})`);
  process.exit(1);
}

console.log(`check-dist: OK (entry ${entries.length} file(s), ${totalBytes} bytes)`);
