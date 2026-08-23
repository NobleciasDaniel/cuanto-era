import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

assert.equal(manifest.manifest_version, 3, "La extensión debe utilizar Manifest V3.");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "La versión debe seguir semver.");
assert.ok(manifest.name.length <= 75, "El nombre supera el límite de Chrome Web Store.");
assert.ok(manifest.short_name.length <= 12, "El nombre corto supera el límite de Chrome Web Store.");
assert.ok(manifest.description.length <= 132, "La descripción supera el límite de Chrome Web Store.");
assert.deepEqual(
  [...manifest.permissions].sort(),
  ["activeTab", "scripting", "storage"].sort(),
  "Los permisos deben permanecer en el conjunto mínimo aprobado."
);
assert.equal(manifest.host_permissions, undefined, "No se permiten permisos permanentes sobre todos los sitios.");
assert.equal(
  manifest.content_security_policy?.extension_pages,
  "script-src 'self'; object-src 'none'",
  "La política de contenido debe bloquear código y objetos externos."
);

const requiredIconSizes = [16, 32, 48, 128];
for (const size of requiredIconSizes) {
  const relativePath = manifest.icons?.[String(size)];
  assert.ok(relativePath, `Falta el icono de ${size} px en el manifest.`);
  const file = readFileSync(join(root, relativePath));
  assert.equal(file.subarray(1, 4).toString("ascii"), "PNG", `${relativePath} no es PNG.`);
  assert.equal(file.readUInt32BE(16), size, `${relativePath} no mide ${size} px de ancho.`);
  assert.equal(file.readUInt32BE(20), size, `${relativePath} no mide ${size} px de alto.`);
}

const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_page,
  "src/privacy/privacy.html"
].filter(Boolean);
for (const relativePath of referencedFiles) {
  assert.ok(existsSync(join(root, relativePath)), `No existe el archivo declarado: ${relativePath}`);
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(join(root, "src"));
for (const file of sourceFiles.filter((path) => path.endsWith(".js"))) {
  const syntax = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr || `JavaScript inválido: ${file}`);
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(source, /\beval\s*\(/, `No se permite eval en ${file}`);
  assert.doesNotMatch(source, /\bnew\s+Function\b/, `No se permite new Function en ${file}`);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, `No se permiten conexiones de red en ${file}`);
  assert.doesNotMatch(source, /\bimport\s*\(\s*["']https?:/i, `No se permiten módulos remotos en ${file}`);
}

for (const file of sourceFiles.filter((path) => path.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `No se permiten manejadores inline en ${file}`);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i, `No se permiten scripts remotos en ${file}`);
  assert.doesNotMatch(html, /<(?:img|link|iframe)[^>]+(?:src|href)=["']https?:/i, `No se permiten recursos remotos en ${file}`);
}

console.log(`Manifest V3 válido; ${sourceFiles.length} archivos de la extensión revisados.`);
