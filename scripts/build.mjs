import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const srcDir = resolve(rootDir, "src");
const outDir = resolve(rootDir, "dist", "chrome");

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function clean() {
  rmSync(resolve(rootDir, "dist"), { recursive: true, force: true });
}

function build() {
  clean();
  ensureDir(outDir);

  for (const entry of readdirSync(srcDir)) {
    cpSync(resolve(srcDir, entry), resolve(outDir, entry), { recursive: true });
  }

  console.log(`Built extension to ${outDir}`);
}

if (process.argv.includes("--clean")) {
  clean();
  console.log("Cleaned dist directory");
} else {
  build();
}
