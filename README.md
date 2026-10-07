# devitska.com

Personal site of Antonina Devitska. A static [Astro](https://astro.build) site whose
content lives in this repository and is edited through [Pages CMS](https://pagescms.org).
It is hosted on GitHub Pages.

```text
Editor ──▶ app.pagescms.org ──commit──▶ GitHub repo ──Action──▶ GitHub Pages
```

## Where the content lives

| Content | File(s) | Shown on |
|---|---|---|
| Articles | `src/content/articles/*.md` | `/blog`, `/blog/<slug>`, home page |
| Service categories + courses | `src/content/services.yaml` | `/courses`, `/courses/<category-slug>` |
| Certificates | `src/content/certificates.yaml` | `/about` |
| Projects | `src/content/projects.yaml` | `/projects` |
| Project moments (gallery) | `src/content/project-moments.yaml` | `/projects` |
| Uploaded images | `src/assets/uploads/**` (referenced as `/uploads/...`) | everywhere |

- Order in the YAML lists is the order on the site (drag to reorder in Pages CMS).
- Schemas live in `src/content.config.ts`. Invalid content or a missing image fails
  the build, so the live site keeps its last good version.
- Uploaded images are resized and converted to WebP at build time (`src/utils/images.ts`).
- Static design assets (logo, hero photos, …) stay in `public/images/`.

## Editing content (Pages CMS)

1. Go to <https://app.pagescms.org> and sign in.
   - **With GitHub:** any collaborator with write access to this repo.
   - **Without GitHub:** a repo admin invites the person by email from the Pages CMS
     dashboard (Settings → Collaborators).
2. Open this repository and the `main` branch.
3. Edit and save. Each save is a commit, and the site updates about 1–2 minutes later.

Configuration: [`.pages.yml`](./.pages.yml).

## Development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static output in ./dist
npm run preview   # serve ./dist locally
```

## Deployment

[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) builds and publishes
to GitHub Pages on every push to `main`, and can also be run manually.

One-time setup:
1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Pages → Custom domain:** `devitska.com`, then enable **Enforce HTTPS**.
3. DNS at the registrar:
   - `devitska.com`: `A` records to `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153` (optionally `AAAA` to `2606:50c0:8000::153` … `8003::153`)
   - `www.devitska.com`: `CNAME` to `<github-user>.github.io`
4. Install the [Pages CMS GitHub App](https://app.pagescms.org) on this repository only.

## Old URLs

The site used to be served by a Go API on Postgres. Old links still work:
- `/blog/<uuid>` redirects to `/blog/<slug>` (via `legacy_id` in each article's frontmatter).
- `/courses?category=<uuid>` and `/courses?category=<slug>` redirect to `/courses/<slug>`.

`scripts/migrate-db-dump.mjs` converted the Postgres dump into these content files.
It can be re-run against a fresher dump, and it overwrites the generated content.
