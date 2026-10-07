/**
 * Read helpers over the git-based content collections (src/content.config.ts).
 * They return display-ready data: sorted, with defaults applied and image
 * paths resolved to optimized URLs.
 */
import { getCollection } from 'astro:content';
import { imageSrc } from './images';

export const DEFAULT_AUTHOR = 'Antonina Devitska';
export const DEFAULT_ARTICLE_IMAGE = '/images/blog-1.png';

export interface Article {
  slug: string;
  legacyId?: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  category: string;
  featured: boolean;
  /** Card-sized optimized URL (falls back to a default image). */
  image: string;
  /** Raw content path, for resolving other sizes with `imageSrc`. */
  imagePath: string;
  href: string;
}

/** All articles, newest first. */
export async function getArticles(): Promise<Article[]> {
  const entries = await getCollection('articles');
  const articles = await Promise.all(
    entries.map(async ({ id, data, body }) => ({
      slug: id,
      legacyId: data.legacy_id,
      title: data.title,
      excerpt: data.excerpt,
      content: body ?? '',
      author: data.author || DEFAULT_AUTHOR,
      date: data.date,
      category: data.category,
      featured: data.featured,
      image: await imageSrc(data.image, 800, DEFAULT_ARTICLE_IMAGE),
      imagePath: data.image,
      href: `/blog/${id}`,
    })),
  );
  return articles.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export interface Course {
  id: string;
  title: string;
  description: string;
  lessons: string;
  duration: string;
  enrollLink: string;
  tags: string[];
  image: string;
  category: string;
}

export interface ServiceCategory {
  slug: string;
  name: string;
  legacyId?: string;
  courses: Course[];
}

/** Course categories with their courses, in the order set in the CMS. */
export async function getServiceCategories(): Promise<ServiceCategory[]> {
  const entries = (await getCollection('services')).sort((a, b) => a.data.order - b.data.order);
  return Promise.all(
    entries.map(async ({ data }) => ({
      slug: data.slug,
      name: data.name,
      legacyId: data.legacy_id,
      courses: await Promise.all(
        data.courses.map(async (course, index) => ({
          id: `${data.slug}-${index + 1}`,
          title: course.title,
          description: course.description,
          lessons: course.lessons,
          duration: course.duration,
          enrollLink: course.enroll_link,
          tags: course.tags,
          image: await imageSrc(course.image, 800),
          category: data.slug,
        })),
      ),
    })),
  );
}

export interface Certificate {
  title: string;
  issuer: string;
  year: string;
  thumbnail: string;
  image: string;
}

export async function getCertificates(): Promise<Certificate[]> {
  const entries = (await getCollection('certificates')).sort((a, b) => a.data.order - b.data.order);
  return Promise.all(
    entries.map(async ({ data }) => ({
      title: data.title,
      issuer: data.issuer,
      year: data.year,
      thumbnail: await imageSrc(data.image, 640),
      image: await imageSrc(data.image, 1800),
    })),
  );
}

export interface Project {
  title: string;
  description: string;
  detail: string;
  linkLabel: string;
  linkHref: string;
  image: string;
}

export async function getProjects(): Promise<Project[]> {
  const entries = (await getCollection('projects')).sort((a, b) => a.data.order - b.data.order);
  return Promise.all(
    entries.map(async ({ data }) => ({
      title: data.title,
      description: data.description,
      detail: data.detail,
      linkLabel: data.link_label,
      linkHref: data.link_href,
      image: await imageSrc(data.image, 1200),
    })),
  );
}

export interface ProjectMoment {
  image: string;
  alt: string;
}

export async function getProjectMoments(): Promise<ProjectMoment[]> {
  const entries = (await getCollection('projectMoments')).sort((a, b) => a.data.order - b.data.order);
  return Promise.all(
    entries.map(async ({ data }) => ({
      image: await imageSrc(data.image, 1200),
      alt: data.alt,
    })),
  );
}
