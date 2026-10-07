import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

/**
 * Pages CMS stores uploads in src/assets/uploads/ and writes "/uploads/<file>"
 * into content (see `media` in .pages.yml). Importing them through Vite lets
 * Astro resize and convert them at build time.
 */
const UPLOADS_PREFIX = '/uploads/';
const uploads = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/uploads/**/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP,AVIF,GIF}',
  { eager: true },
);

/**
 * Resolves a content image path to a URL ready for <img src>.
 *
 * - "/uploads/..." → optimized WebP, at most `width` px wide (build fails if the file is missing)
 * - "/images/...", "https://..." → returned unchanged
 * - empty → `fallback`
 */
export async function imageSrc(src: string | undefined, width: number, fallback = ''): Promise<string> {
  if (!src) return fallback;
  if (!src.startsWith(UPLOADS_PREFIX)) return src;

  const key = `/src/assets/uploads/${decodeURIComponent(src.slice(UPLOADS_PREFIX.length))}`;
  const image = uploads[key]?.default;
  if (!image) {
    throw new Error(`Image "${src}" not found. Expected file at ${key.slice(1)}`);
  }
  if (image.format === 'gif') return image.src;

  const optimized = await getImage({ src: image, width: Math.min(width, image.width), format: 'webp' });
  return optimized.src;
}
