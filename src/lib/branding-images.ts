import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import sharp from "sharp";
import { BRAND_IMAGE_PATTERN } from "./branding";
export const MAX_BRAND_BYTES = 4 * 1024 * 1024;
export function brandingUploadDirectory() { return path.resolve(/* turbopackIgnore: true */ process.env.BRANDING_UPLOAD_DIR || path.join(process.cwd(), "data/uploads/branding")); }
export async function storeBrandingImage(bytes: Buffer, mime: string, kind: string) {
  if (!["logo","icon"].includes(kind)) throw new Error("Choose a logo or icon upload.");
  if (!bytes.length || bytes.length > MAX_BRAND_BYTES) throw new Error("Choose an image up to 4 MB.");
  if (!["image/png","image/jpeg","image/webp"].includes(mime)) throw new Error("Upload PNG, JPEG or WebP (not SVG, GIF or ICO).");
  let output: Buffer;
  try {
    const image=sharp(bytes,{limitInputPixels:40000000,failOn:"error"}), meta=await image.metadata();
    if (!["png","jpeg","webp"].includes(meta.format || "") || (meta.pages || 1)>1 || !meta.width || !meta.height || meta.width<16 || meta.height<16) throw new Error("Invalid image");
    if (kind==="icon" && (meta.width!==meta.height || meta.width<64)) throw new Error("Icon must be square and at least 64 × 64 pixels.");
    output = kind==="icon" ? await image.rotate().resize(512,512).png().toBuffer() : await image.rotate().resize({width:1200,height:600,fit:"inside",withoutEnlargement:true}).webp({quality:90}).toBuffer();
  } catch (error) { if (error instanceof Error && error.message.startsWith("Icon must")) throw error; throw new Error("Choose a decodable, non-animated PNG, JPEG or WebP under 40 megapixels (minimum 16 × 16)."); }
  const filename=`${randomUUID()}.${kind==="icon" ? "png" : "webp"}`;
  await mkdir(brandingUploadDirectory(),{recursive:true});
  await writeFile(path.join(/* turbopackIgnore: true */ brandingUploadDirectory(),filename),output,{flag:"wx",mode:0o640});
  return `/api/branding-images/${filename}`;
}
export async function checkBrandingImage(url: string) {
  if (!url) return;
  if (!BRAND_IMAGE_PATTERN.test(url)) throw new Error("Choose an uploaded branding image.");
  try { await access(path.join(/* turbopackIgnore: true */ brandingUploadDirectory(),path.basename(url))); } catch { throw new Error("A branding image is missing. Upload it again before saving."); }
}
export async function readBrandingImage(filename: string) {
  if (!BRAND_IMAGE_PATTERN.test(`/api/branding-images/${filename}`)) return null;
  try { return await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ brandingUploadDirectory(),filename)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code==="ENOENT") return null; throw error; }
}
