import path from "node:path";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { CAROUSEL_IMAGE_PATTERN } from "./homepage-carousel";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export function carouselUploadDirectory() {
  return path.resolve(/* turbopackIgnore: true */ process.env.CAROUSEL_UPLOAD_DIR || path.join(process.cwd(), "data/uploads/carousel"));
}
export async function storeCarouselImage(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Choose an image up to 8 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("Upload a JPEG, PNG or WebP image (not SVG/GIF).");
  let output: Buffer;
  try {
    const image = sharp(bytes, { limitInputPixels: 40000000, failOn: "error" });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error("Unsupported image");
    // Decode and re-encode: strip original metadata and never serve uploaded source bytes.
    output = await image.rotate().resize({ width: 2400, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new Error("That image could not be decoded. Choose a non-animated JPEG, PNG or WebP under 40 megapixels."); }
  const filename = `${randomUUID()}.webp`;
  await mkdir(carouselUploadDirectory(), { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ carouselUploadDirectory(), filename), output, { flag: "wx", mode: 0o640 });
  return `/api/carousel-images/${filename}`;
}
export async function checkCarouselImage(image: string) {
  if (CAROUSEL_IMAGE_PATTERN.test(image)) await access(path.join(/* turbopackIgnore: true */ carouselUploadDirectory(), path.basename(image)));
}
export async function readCarouselImage(filename: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(filename)) return null;
  try { return await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ carouselUploadDirectory(), filename)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
