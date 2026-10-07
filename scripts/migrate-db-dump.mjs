#!/usr/bin/env node
/**
 * One-off migration: Postgres dump (pg_dump plain format) -> git-based content.
 *
 * Usage:
 *   node scripts/migrate-db-dump.mjs path/to/database_dump.sql
 *
 * Writes (overwriting previous output):
 *   src/content/articles/*.md         blog articles (Markdown + YAML frontmatter)
 *   src/content/services.yaml         course categories with their courses
 *   src/content/certificates.yaml     certificates (list order = display order)
 *   src/content/projects.yaml         projects (list order = display order)
 *   src/content/project-moments.yaml  gallery images (list order = display order)
 *   src/assets/uploads/**             images extracted from base64 data URIs
 *
 * The `users` table is intentionally ignored (Pages CMS handles logins).
 * Safe to re-run against a fresher dump right before cutover.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import YAML from 'yaml';

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('Usage: node scripts/migrate-db-dump.mjs <database_dump.sql>');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONTENT_DIR = path.join(ROOT, 'src/content');
const UPLOADS_DIR = path.join(ROOT, 'src/assets/uploads');
const UPLOADS_URL = '/uploads';
// Originals larger than this (long edge, px) are downscaled to keep the repo lean.
// Astro still generates smaller responsive variants at build time.
const MAX_ORIGINAL_EDGE = 2400;

// ---------------------------------------------------------------------------
// Dump parsing (COPY ... FROM stdin blocks, tab-separated, backslash-escaped)
// ---------------------------------------------------------------------------

function unescapeCopyValue(value) {
  if (value === '\\N') return null;
  return value.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '\\': '\\' })[c] ?? c);
}

function parseDump(sql) {
  const tables = {};
  let current = null;
  let columns = [];
  for (const line of sql.split('\n')) {
    const copy = line.match(/^COPY public\.(\w+) \((.*)\) FROM stdin;$/);
    if (copy) {
      current = copy[1];
      columns = copy[2].split(',').map((c) => c.trim());
      tables[current] = [];
      continue;
    }
    if (!current) continue;
    if (line === '\\.') {
      current = null;
      continue;
    }
    const values = line.split('\t').map(unescapeCopyValue);
    tables[current].push(Object.fromEntries(columns.map((c, i) => [c, values[i]])));
  }
  return tables;
}

function parsePgArray(value) {
  if (!value || value === '{}') return [];
  const inner = value.slice(1, -1);
  const items = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g;
  let m;
  while ((m = re.exec(inner))) {
    items.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Ukrainian national transliteration (simplified, lowercase)
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '',
};

function slugify(text, maxLength = 60) {
  const slug = text
    .toLowerCase()
    .replace(/[\u0400-\u04ff]/g, (ch) => TRANSLIT[ch] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : maxLength).replace(/-+$/, '');
}

function uniqueSlug(base, used, fallback) {
  let slug = base || fallback;
  for (let i = 2; used.has(slug); i++) slug = `${base || fallback}-${i}`;
  used.add(slug);
  return slug;
}

function detectImageType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.subarray(0, 4).toString('hex') === '89504e47') return 'png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buffer.subarray(0, 3).toString() === 'GIF') return 'gif';
  return null;
}

const stats = { images: 0, bytesIn: 0, bytesOut: 0 };

/**
 * Turns a DB image value into a content image path.
 * - data: URIs are decoded into src/assets/uploads/<folder>/<name>.<ext>
 * - existing paths/URLs (e.g. /images/service-1.png) are kept as-is
 */
async function extractImage(value, folder, name) {
  if (!value) return '';
  if (!value.startsWith('data:')) return value;

  const base64 = value.slice(value.indexOf(',') + 1);
  let buffer = Buffer.from(base64, 'base64');
  const ext = detectImageType(buffer);
  if (!ext) throw new Error(`Unknown image format for ${folder}/${name}`);
  stats.bytesIn += buffer.length;

  if (ext === 'jpg' || ext === 'png' || ext === 'webp') {
    const meta = await sharp(buffer).metadata();
    const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longEdge > MAX_ORIGINAL_EDGE) {
      let pipeline = sharp(buffer).rotate().resize({ width: MAX_ORIGINAL_EDGE, height: MAX_ORIGINAL_EDGE, fit: 'inside' });
      pipeline = ext === 'jpg' ? pipeline.jpeg({ quality: 85, mozjpeg: true }) : pipeline.toFormat(ext);
      buffer = await pipeline.toBuffer();
    }
  }

  const dir = path.join(UPLOADS_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${name}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  stats.images++;
  stats.bytesOut += buffer.length;
  return `${UPLOADS_URL}/${folder}/${fileName}`;
}

const byNumber = (key) => (a, b) => Number(a[key]) - Number(b[key]);
const byDateDesc = (key) => (a, b) => String(b[key]).localeCompare(String(a[key]));
const byDateAsc = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));

function writeYaml(file, data, header) {
  const body = YAML.stringify(data, { lineWidth: 0 });
  fs.writeFileSync(path.join(CONTENT_DIR, file), `${header ? `# ${header}\n` : ''}${body}`);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

const tables = parseDump(fs.readFileSync(dumpPath, 'utf8'));
for (const t of ['articles', 'categories', 'courses', 'certificates', 'projects', 'project_moments']) {
  if (!tables[t]) throw new Error(`Table "${t}" not found in dump`);
}

fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
fs.rmSync(path.join(CONTENT_DIR, 'articles'), { recursive: true, force: true });
fs.mkdirSync(path.join(CONTENT_DIR, 'articles'), { recursive: true });

// Articles -> one Markdown file each
{
  const used = new Set();
  const articles = [...tables.articles].sort(byDateDesc('date'));
  for (const a of articles) {
    const slug = uniqueSlug(slugify(a.title), used, 'article');
    const frontmatter = {
      title: a.title,
      excerpt: a.excerpt ?? '',
      author: a.author ?? '',
      date: a.date ?? a.created_at.slice(0, 10),
      category: a.category ?? '',
      featured: a.featured === 't',
      image: await extractImage(a.image, 'articles', slug),
      legacy_id: a.id,
    };
    const body = (a.content ?? '').replace(/\r\n/g, '\n').trim();
    const file = `---\n${YAML.stringify(frontmatter, { lineWidth: 0 })}---\n\n${body}\n`;
    fs.writeFileSync(path.join(CONTENT_DIR, 'articles', `${slug}.md`), file);
  }
  console.log(`articles: ${articles.length}`);
}

// Course categories + courses -> services.yaml (nested, list order = display order)
{
  const usedCategorySlugs = new Set();
  const usedCourseSlugs = new Set();
  const categories = tables.categories
    .filter((c) => c.type === 'course')
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || byDateAsc('created_at')(a, b));
  const known = new Set(categories.map((c) => c.id));
  const orphans = tables.courses.filter((c) => !known.has(c.category));
  if (orphans.length) {
    console.warn(`WARNING: ${orphans.length} course(s) reference a missing category and were skipped:`, orphans.map((c) => c.title));
  }

  const services = [];
  for (const cat of categories) {
    const courses = tables.courses.filter((c) => c.category === cat.id).sort(byDateDesc('created_at'));
    const items = [];
    for (const c of courses) {
      const slug = uniqueSlug(slugify(c.title, 50), usedCourseSlugs, 'course');
      items.push({
        title: c.title,
        description: c.description ?? '',
        lessons: c.lessons ?? '',
        duration: c.duration ?? '',
        enroll_link: c.price ?? '', // the DB column "price" holds the enroll link
        tags: parsePgArray(c.tags),
        image: await extractImage(c.image, 'courses', slug),
      });
    }
    services.push({
      name: cat.name,
      slug: uniqueSlug(slugify(cat.name.replace(/\(.*?\)/g, ''), 50), usedCategorySlugs, 'category'),
      legacy_id: cat.id,
      courses: items,
    });
  }
  writeYaml('services.yaml', services, 'Service categories and their courses. Order here = order on the site.');
  console.log(`categories: ${services.length}, courses: ${services.reduce((n, s) => n + s.courses.length, 0)}`);
}

// Certificates
{
  const used = new Set();
  const rows = [...tables.certificates].sort((a, b) => byNumber('sort_order')(a, b) || byDateDesc('created_at')(a, b));
  const certificates = [];
  for (const c of rows) {
    const slug = uniqueSlug(slugify(`${c.year} ${c.title}`, 50), used, 'certificate');
    certificates.push({ title: c.title, issuer: c.issuer, year: c.year, image: await extractImage(c.image, 'certificates', slug) });
  }
  writeYaml('certificates.yaml', certificates, 'Certificates on the About page. Order here = order on the site.');
  console.log(`certificates: ${certificates.length}`);
}

// Projects
{
  const used = new Set();
  const rows = [...tables.projects].sort((a, b) => byNumber('sort_order')(a, b) || byDateDesc('created_at')(a, b));
  const projects = [];
  for (const p of rows) {
    const slug = uniqueSlug(slugify(p.title, 50), used, 'project');
    projects.push({
      title: p.title,
      description: p.description ?? '',
      detail: p.detail ?? '',
      link_label: p.link_label ?? '',
      link_href: p.link_href ?? '',
      image: await extractImage(p.image, 'projects', slug),
    });
  }
  writeYaml('projects.yaml', projects, 'Projects page highlights. Order here = order on the site.');
  console.log(`projects: ${projects.length}`);
}

// Project moments (gallery)
{
  const rows = [...tables.project_moments].sort((a, b) => byNumber('sort_order')(a, b) || byDateAsc('created_at')(a, b));
  const moments = [];
  for (const [i, m] of rows.entries()) {
    moments.push({ image: await extractImage(m.image, 'moments', `moment-${String(i + 1).padStart(2, '0')}`), alt: m.alt ?? '' });
  }
  writeYaml('project-moments.yaml', moments, 'Gallery on the Projects page. Order here = order on the site.');
  console.log(`project moments: ${moments.length}`);
}

const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`images: ${stats.images} extracted, ${mb(stats.bytesIn)} MB decoded -> ${mb(stats.bytesOut)} MB written`);
