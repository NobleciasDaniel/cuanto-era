import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const dist = join(root, "dist");
const staging = join(dist, "package");
const archive = join(dist, `cuanto-era-${manifest.version}.zip`);

rmSync(staging, { recursive: true, force: true });
rmSync(archive, { force: true });
mkdirSync(staging, { recursive: true });

cpSync(join(root, "manifest.json"), join(staging, "manifest.json"));
cpSync(join(root, "icons"), join(staging, "icons"), { recursive: true });
cpSync(join(root, "src"), join(staging, "src"), { recursive: true });

const zip = spawnSync("zip", ["-q", "-r", archive, "manifest.json", "icons", "src"], {
  cwd: staging,
  encoding: "utf8"
});
if (zip.status !== 0) throw new Error(zip.stderr || "No fue posible crear el ZIP de publicación.");

const listing = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
if (listing.status !== 0) throw new Error(listing.stderr || "No fue posible verificar el ZIP.");
const files = listing.stdout.trim().split("\n").filter(Boolean);
if (!files.includes("manifest.json")) throw new Error("manifest.json no quedó en la raíz del ZIP.");
if (files.some((file) => /(?:^|\/)(?:node_modules|test|store-assets|scripts|\.DS_Store)(?:\/|$)/.test(file))) {
  throw new Error("El ZIP contiene archivos de desarrollo.");
}

console.log(`Paquete listo: ${archive}`);
console.log(`${files.length} archivos de producción incluidos.`);
