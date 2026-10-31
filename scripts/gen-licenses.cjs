// Lists the open-source packages Huddle ships (production dependencies of the server, the web app and the
// shared package, plus everything they pull in) for the /licenses page.
// Run after changing dependencies: node scripts/gen-licenses.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'apps', 'web', 'src', 'landing', 'licenses.json');
const WORKSPACES = ['apps/server', 'apps/web', 'packages/shared'];

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const pkgs = lock.packages;

/** Node's lookup: <from>/node_modules/<name>, then each parent's node_modules, then the root. */
function resolve(from, name) {
  let dir = from;
  for (;;) {
    const key = (dir ? dir + '/' : '') + 'node_modules/' + name;
    if (pkgs[key]) return key;
    if (!dir) return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i >= 0 ? dir.slice(0, i) : '';
  }
}

function readPkgJson(key) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, key, 'package.json'), 'utf8')); } catch { return null; }
}

function licenseOf(meta, pj) {
  const l = pj?.license ?? meta.license ?? pj?.licenses;
  if (!l) return 'UNKNOWN';
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x.type)).join(' OR ');
  return l.type ?? 'UNKNOWN';
}

function linkOf(name, pj) {
  if (pj?.homepage && /^https?:\/\//.test(pj.homepage)) return pj.homepage;
  let repo = typeof pj?.repository === 'string' ? pj.repository : pj?.repository?.url;
  if (repo) {
    repo = repo.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '');
    if (/^github:/.test(repo)) repo = 'https://github.com/' + repo.slice(7);
    else if (/^[\w.-]+\/[\w.-]+$/.test(repo)) repo = 'https://github.com/' + repo;
    if (/^https?:\/\//.test(repo)) return repo;
  }
  return 'https://www.npmjs.com/package/' + name;
}

const seen = new Map(); // lock key -> entry
const queue = [];
for (const ws of WORKSPACES) {
  const meta = pkgs[ws];
  for (const name of Object.keys({ ...(meta.dependencies || {}), ...(meta.optionalDependencies || {}) })) queue.push([ws, name]);
}
while (queue.length) {
  const [from, name] = queue.shift();
  const key = resolve(from, name);
  if (!key || seen.has(key)) continue;
  const meta = pkgs[key];
  if (meta.link || meta.dev) { seen.set(key, null); continue; } // workspace links / dev-only
  const pj = readPkgJson(key);
  seen.set(key, { name, version: meta.version, license: licenseOf(meta, pj), url: linkOf(name, pj) });
  for (const dep of Object.keys({ ...(meta.dependencies || {}), ...(meta.optionalDependencies || {}) })) queue.push([key, dep]);
}

const byId = new Map();
for (const e of seen.values()) if (e) byId.set(`${e.name}@${e.version}`, e);
const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
fs.writeFileSync(OUT, JSON.stringify(list, null, 1) + '\n');
console.log(`wrote ${list.length} packages to ${path.relative(ROOT, OUT)}`);
