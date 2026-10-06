/**
 * Writes marketing /siteshots under public/siteshots (~60KB JPEG each).
 *
 * - With GEMINI_API_KEY (or GOOGLE_API_KEY) in `.env` or the environment: uses Imagen (Gemini API).
 * - Without a key: writes compressed brand-style raster fallbacks (re-run after adding a key for Imagen).
 */
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OUT_DIR = path.join(__dirname, '..', 'public', 'siteshots');
const TARGET_BYTES = 60 * 1024;
const MODEL = 'imagen-4.0-fast-generate-001';

const STYLE =
  'Professional stock photography style, natural soft lighting, clean composition, no text, no logos, no watermarks, UK modern interiors where relevant.';

const JOBS = [
  {
    file: 'home-reference-final.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Wide hero image of a pristine modern living room after professional house cleaning, sunlight, calm neutral palette with subtle teal accents in decor, ${STYLE}`,
    fallback: { c1: '#0f172a', c2: '#115e59', c3: '#f8fafc' },
  },
  {
    file: 'residential-a.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Bright open-plan kitchen and dining area spotless and organized, residential cleaning result, ${STYLE}`,
    fallback: { c1: '#1e293b', c2: '#0d9488', c3: '#fefce8' },
  },
  {
    file: 'residential-b.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Bright empty hotel breakfast lounge with tidy tables and chairs, polished surfaces, morning light, no people, hospitality venue ready for guests, ${STYLE}`,
    fallback: { c1: '#334155', c2: '#b45309', c3: '#fff7ed' },
  },
  {
    file: 'residential-c.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Modern corporate office lobby with reception desk, gleaming floors, plants, daytime, ${STYLE}`,
    fallback: { c1: '#1e3a5f', c2: '#475569', c3: '#e2e8f0' },
  },
  {
    file: 'commercial.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Spacious open-plan office workspace, desks and chairs immaculate, large windows, commercial cleaning, ${STYLE}`,
    fallback: { c1: '#0f172a', c2: '#3b82f6', c3: '#f1f5f9' },
  },
  {
    file: 'commercial-reference-new.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Contemporary office meeting area and glass walls, presentation-ready, ${STYLE}`,
    fallback: { c1: '#172554', c2: '#64748b', c3: '#f8fafc' },
  },
  {
    file: 'about-reference-new.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Close-up of professional cleaning cart with eco bottles and microfiber cloths in a bright hallway, trustworthy service mood, no people, ${STYLE}`,
    fallback: { c1: '#134e4a', c2: '#14b8a6', c3: '#ecfdf5' },
  },
  {
    file: 'about.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Hands placing fresh folded towels on a bathroom shelf, spa-clean bathroom blur background, ${STYLE}`,
    fallback: { c1: '#164e63', c2: '#06b6d4', c3: '#f0fdfa' },
  },
  {
    file: 'pricing.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Minimal desk with simple calculator, notebook, and pen on white surface, metaphor for transparent pricing, ${STYLE}`,
    fallback: { c1: '#f8fafc', c2: '#94a3b8', c3: '#0f766e' },
  },
  {
    file: 'pricing-reference.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Clean home office nook with laptop closed and tidy papers, trustworthy planning vibe, ${STYLE}`,
    fallback: { c1: '#f1f5f9', c2: '#64748b', c3: '#0f766e' },
  },
  {
    file: 'contact.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Welcoming modern entryway with console table, fresh flowers, soft daylight, inviting contact-us mood, ${STYLE}`,
    fallback: { c1: '#1c1917', c2: '#0f766e', c3: '#fef3c7' },
  },
  {
    file: 'airbnb-short-let-hero.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Stylish short-term rental apartment living room, sofa and coffee table perfectly staged for guests, hotel-quality turnover, ${STYLE}`,
    fallback: { c1: '#292524', c2: '#d97706', c3: '#fffbeb' },
  },
  {
    file: 'residential-reference-new.jpg',
    aspectRatio: '4:3',
    personGeneration: 'dont_allow',
    prompt: `Sunlit living room with plush sofa and gleaming floor, residential deep clean result, ${STYLE}`,
    fallback: { c1: '#422006', c2: '#ea580c', c3: '#fff7ed' },
  },
  {
    file: 'homepage-new-reference.jpg',
    aspectRatio: '16:9',
    personGeneration: 'dont_allow',
    prompt: `Aerial-style wide interior of serene bedroom and ensuite door ajar, crisp linens, peaceful premium clean, ${STYLE}`,
    fallback: { c1: '#312e81', c2: '#6366f1', c3: '#eef2ff' },
  },
];

function toBuffer(imageBytes) {
  if (!imageBytes) return null;
  if (Buffer.isBuffer(imageBytes)) return imageBytes;
  if (imageBytes instanceof Uint8Array) return Buffer.from(imageBytes);
  if (typeof imageBytes === 'string') return Buffer.from(imageBytes, 'base64');
  return null;
}

function parseAspect(ar) {
  const [a, b] = ar.split(':').map(Number);
  return a / b;
}

function fallbackSvg(job) {
  const { c1, c2, c3 } = job.fallback;
  const ratio = parseAspect(job.aspectRatio);
  const w = 1920;
  const h = Math.round(w / ratio);
  const id = job.file.replace(/\W/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="55%" stop-color="${c2}"/>
      <stop offset="100%" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="glow${id}" cx="70%" cy="25%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg${id})"/>
  <rect width="100%" height="100%" fill="url(#glow${id})"/>
  <rect width="100%" height="100%" fill="#000000" fill-opacity="0.04"/>
</svg>`;
}

/** Largest JPEG under TARGET_BYTES (aims near ~60KB for web budgets). */
async function compressToTarget(input) {
  const meta = await sharp(input).metadata();
  const capW = Math.min(meta.width || 2000, 2000);
  const widths = [...new Set([capW, 1680, 1440, 1280, 1120, 960, 840, 720].map((w) => Math.min(w, capW)))].sort(
    (a, b) => b - a,
  );
  let best = null;

  for (const width of widths) {
    let lo = 32;
    let hi = 93;
    let candidate = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const buf = await sharp(input)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: mid, mozjpeg: true })
        .toBuffer();
      if (buf.length <= TARGET_BYTES) {
        candidate = buf;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (candidate && (!best || candidate.length > best.length)) best = candidate;
  }

  if (best) return best;
  return sharp(input).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 30, mozjpeg: true }).toBuffer();
}

async function writeFallbackJpeg(job) {
  const svg = fallbackSvg(job);
  const raw = await sharp(Buffer.from(svg)).png().toBuffer();
  return compressToTarget(raw);
}

async function main() {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const useImagen = Boolean(apiKey);
  const only = (process.env.REGEN_ONLY || '').trim();
  const jobs = only ? JOBS.filter((j) => j.file === only) : JOBS;
  if (only && jobs.length === 0) {
    console.error(`[generate-siteshots] No job matches REGEN_ONLY=${only}`);
    process.exit(1);
  }

  if (!useImagen) {
    console.warn(
      '[generate-siteshots] GEMINI_API_KEY not set — writing ~60KB gradient fallbacks. Add the key to .env and re-run for Imagen (Gemini API) photos.',
    );
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const ai = useImagen ? new GoogleGenAI({ apiKey }) : null;

  for (const job of jobs) {
    process.stdout.write(`${useImagen ? 'Imagen' : 'Fallback'} ${job.file}… `);
    let out;
    if (useImagen && ai) {
      try {
        const response = await ai.models.generateImages({
          model: MODEL,
          prompt: job.prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: job.aspectRatio,
            personGeneration: job.personGeneration || 'dont_allow',
          },
        });
        const first = response?.generatedImages?.[0];
        const buf = toBuffer(first?.image?.imageBytes);
        if (!buf) throw new Error('No image bytes in Imagen response');
        out = await compressToTarget(buf);
      } catch (e) {
        console.warn(`\n[generate-siteshots] Imagen failed for ${job.file}, using fallback:`, e?.message || e);
        out = await writeFallbackJpeg(job);
      }
    } else {
      out = await writeFallbackJpeg(job);
    }

    const outPath = path.join(OUT_DIR, job.file);
    await fs.writeFile(outPath, out);
    console.log(`${(out.length / 1024).toFixed(1)} KB`);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
