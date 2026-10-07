/**
 * Site content lives in git under src/content/ and is edited through Pages CMS
 * (see .pages.yml). The schemas here validate it at build time, so a broken
 * edit fails the deploy instead of publishing a broken page.
 *
 * Image fields hold either an uploaded file path ("/uploads/...", stored in
 * src/assets/uploads/ and optimized at build time — see src/utils/images.ts),
 * a static file under public/ ("/images/..."), or an empty string.
 */
import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';
import YAML from 'yaml';

const text = z.string().nullish().transform((v) => v ?? '');

// Pages CMS writes dates as YYYY-MM-DD; YAML may parse them into Date objects.
const isoDate = z
  .union([z.string(), z.date()])
  .transform((d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10)));

/** Loads a YAML file whose top level is a list; list position becomes the sort order. */
const orderedList = (path: string) =>
  file(path, {
    parser: (raw) =>
      ((YAML.parse(raw) ?? []) as Record<string, unknown>[]).map((item, index) => ({
        ...item,
        id: String(index).padStart(4, '0'),
        order: index,
      })),
  });

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    excerpt: text,
    author: text,
    date: isoDate,
    category: text,
    featured: z.boolean().default(false),
    image: text,
    // UUID from the old database; /blog/<legacy_id> redirects to the new URL.
    legacy_id: z.string().optional(),
  }),
});

const course = z.object({
  title: z.string(),
  description: text,
  lessons: text,
  duration: text,
  enroll_link: text,
  tags: z.array(z.string()).nullish().transform((v) => v ?? []),
  image: text,
});

const services = defineCollection({
  loader: orderedList('src/content/services.yaml'),
  schema: z.object({
    order: z.number(),
    name: z.string(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only'),
    // UUID from the old database; /courses?category=<legacy_id> redirects to the new URL.
    legacy_id: z.string().optional(),
    courses: z.array(course).nullish().transform((v) => v ?? []),
  }),
});

const certificates = defineCollection({
  loader: orderedList('src/content/certificates.yaml'),
  schema: z.object({
    order: z.number(),
    title: z.string(),
    issuer: text,
    year: z.coerce.string(),
    image: text,
  }),
});

const projects = defineCollection({
  loader: orderedList('src/content/projects.yaml'),
  schema: z.object({
    order: z.number(),
    title: z.string(),
    description: text,
    detail: text,
    link_label: text,
    link_href: text,
    image: text,
  }),
});

const projectMoments = defineCollection({
  loader: orderedList('src/content/project-moments.yaml'),
  schema: z.object({
    order: z.number(),
    image: z.string(),
    alt: text,
  }),
});

export const collections = { articles, services, certificates, projects, projectMoments };
