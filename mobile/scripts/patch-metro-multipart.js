/**
 * RN 0.83 Android OkHttp fails to parse Metro's chunked multipart/mixed bundle
 * responses over 10.0.2.2 (ProtocolException: Expected leading [0-9a-fA-F]…).
 * Disabling multipart makes Metro return a plain application/javascript body, which
 * BundleDownloader handles via its non-multipart fallback path.
 *
 * Expo resolves metro from @expo/metro/node_modules/metro — patch every copy.
 */
const fs = require('fs');
const path = require('path');

const MARKER = 'DriveMind: disable multipart';
const repoRoot = path.join(__dirname, '..', '..');

const replacement = `static wrapIfSupported(req, res) {
    // ${MARKER} — fixes Android white screen / ProtocolException on Windows dev
    return res;
  }`;

function discoverMultipartFiles() {
  const found = new Set();
  const roots = [
    path.join(repoRoot, 'node_modules'),
    path.join(repoRoot, 'mobile', 'node_modules'),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('@')) continue;
      walkScopedPackage(path.join(root, entry.name), found);
    }
    walkMetroPackage(root, found);
  }

  return [...found];
}

function walkScopedPackage(scopeDir, found) {
  if (!fs.existsSync(scopeDir)) return;
  for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = path.join(scopeDir, entry.name);
    walkMetroPackage(pkgDir, found);
    const nested = path.join(pkgDir, 'node_modules');
    if (fs.existsSync(nested)) {
      walkMetroPackage(nested, found);
      for (const nestedEntry of fs.readdirSync(nested, { withFileTypes: true })) {
        if (nestedEntry.isDirectory() && nestedEntry.name.startsWith('@')) {
          walkScopedPackage(path.join(nested, nestedEntry.name), found);
        }
      }
    }
  }
}

function walkMetroPackage(dir, found) {
  const metroFile = path.join(dir, 'metro', 'src', 'Server', 'MultipartResponse.js');
  if (fs.existsSync(metroFile)) {
    found.add(metroFile);
  }
  const directFile = path.join(dir, 'src', 'Server', 'MultipartResponse.js');
  if (path.basename(dir) === 'metro' && fs.existsSync(directFile)) {
    found.add(directFile);
  }
}

function patchFile(file, dryRun = false) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) {
    return 'already';
  }

  if (dryRun) {
    return 'skip';
  }

  const pattern = /static wrapIfSupported\(req, res\) \{[\s\S]*?\n  \}/;
  if (!pattern.test(src)) {
    return 'skip';
  }

  src = src.replace(pattern, replacement);
  fs.writeFileSync(file, src);
  return 'patched';
}

const checkOnly = process.argv.includes('--check');

const candidates = discoverMultipartFiles();
let patched = 0;
let already = 0;
let needsPatch = 0;

for (const file of candidates) {
  const result = patchFile(file, checkOnly);
  const rel = path.relative(repoRoot, file);
  if (result === 'patched') {
    if (!checkOnly) console.log('[DriveMind] Patched Metro multipart response:', rel);
    patched += 1;
  } else if (result === 'already') {
    if (!checkOnly) console.log('[DriveMind] Metro multipart patch already applied:', rel);
    already += 1;
  } else {
    needsPatch += 1;
    if (!checkOnly) console.warn('[DriveMind] Metro MultipartResponse.js layout changed; skip', rel);
  }
}

if (checkOnly) {
  const ok = candidates.length > 0 && candidates.every((f) => fs.readFileSync(f, 'utf8').includes(MARKER));
  process.exit(ok ? 0 : 1);
}

if (patched === 0 && already === 0) {
  console.warn('[DriveMind] No Metro MultipartResponse.js found — run npm install from repo root');
  process.exitCode = 1;
}
