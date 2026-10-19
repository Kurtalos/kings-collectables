import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storeMeta } from "@/db/schema";
import { DEFAULT_CAROUSEL, validateCarousel } from "./homepage-carousel";
import { checkCarouselImage } from "./carousel-images";
const KEY = "homepage.carousel.v1";
export async function readHomepageCarousel() {
  const [row] = await db.select().from(storeMeta).where(eq(storeMeta.key, KEY)).limit(1);
  return row ? validateCarousel(JSON.parse(row.value)) : DEFAULT_CAROUSEL.map(slide => ({ ...slide }));
}
export const getHomepageCarousel = cache(readHomepageCarousel);
export async function saveHomepageCarousel(input: unknown) {
  const slides = validateCarousel(input);
  try { await Promise.all(slides.map(slide => checkCarouselImage(slide.image))); }
  catch { throw new Error("An uploaded image is missing. Upload it again before saving."); }
  await db.insert(storeMeta).values({ key: KEY, value: JSON.stringify(slides) }).onConflictDoUpdate({ target: storeMeta.key, set: { value: JSON.stringify(slides) } });
  return slides;
}
