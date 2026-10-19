import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DEFAULT_CAROUSEL, validateCarousel } from "../src/lib/homepage-carousel";
import { storeCarouselImage, readCarouselImage } from "../src/lib/carousel-images";
test("carousel validates order, visibility, bounds and safe internal links/images", () => {
  assert.equal(validateCarousel(DEFAULT_CAROUSEL)[1].id, "default-bloomburrow");
  const a = DEFAULT_CAROUSEL[0];
  for (const patch of [{ title: "" }, { focalX: -1 }, { focalY: NaN }, { href: "javascript:alert(1)" }, { href: "//evil.invalid" }, { href: "/\\evil.invalid" }, { image: "/api/carousel-images/../../secret" }, { image: "https://evil.invalid/test.jpg" }, { href: "", primary: "Click" }]) assert.throws(() => validateCarousel([{ ...a, ...patch }]));
  assert.throws(() => validateCarousel([{ ...a, enabled: false }]));
  assert.throws(() => validateCarousel([a, a]));
  assert.throws(() => validateCarousel(Array.from({ length: 13 }, (_, i) => ({ ...a, id: `slide-${i}` }))));
  assert.equal(validateCarousel([{ ...a, primary: "", href: "", secondary: "", secondHref: "", title: "Café\nWinter sale" }])[0].title, "Café\nWinter sale");
});
test("image uploads decode/re-encode as WebP, reject unsafe formats and cannot traverse paths", async () => {
  await mkdir("artifacts", { recursive: true });
  const directory = await mkdtemp(path.resolve("artifacts/carousel-unit-"));
  const before = process.env.CAROUSEL_UPLOAD_DIR;
  process.env.CAROUSEL_UPLOAD_DIR = directory;
  try {
    const input = await sharp({ create: { width: 2600, height: 1800, channels: 3, background: "#e86313" } }).png().toBuffer();
    const url = await storeCarouselImage(input, "image/png");
    const data = await readCarouselImage(path.basename(url));
    assert.ok(data);
    const meta = await sharp(data).metadata();
    assert.equal(meta.format, "webp"); assert.ok(meta.width! <= 2400); assert.ok(meta.height! <= 1600); assert.equal(meta.exif, undefined);
    assert.equal(await readCarouselImage("../package.json"), null);
    await assert.rejects(storeCarouselImage(Buffer.from("<svg></svg>"), "image/svg+xml"));
    await assert.rejects(storeCarouselImage(Buffer.from("<svg></svg>"), "image/png"));
    await assert.rejects(storeCarouselImage(Buffer.alloc(8 * 1024 * 1024 + 1), "image/png"));
  } finally {
    if (before === undefined) delete process.env.CAROUSEL_UPLOAD_DIR; else process.env.CAROUSEL_UPLOAD_DIR = before;
    await rm(directory, { recursive: true, force: true });
  }
});
