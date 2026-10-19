export type CarouselSlide = {
  id: string; enabled: boolean; eyebrow: string; title: string; description: string;
  image: string; focalX: number; focalY: number;
  primary: string; href: string; secondary: string; secondHref: string;
};
export const DEFAULT_CAROUSEL: CarouselSlide[] = [
  { id: "default-vault", enabled: true, eyebrow: "", title: "Your next great\ndeck starts here.", description: "Discover the singles you need. Find the cards you love.", image: "/images/vault-hero.jpg", primary: "Shop all singles", href: "/cards", secondary: "Explore the latest sets", secondHref: "/cards?category=new-arrivals", focalX: 50, focalY: 47 },
  { id: "default-bloomburrow", enabled: true, eyebrow: "THERE'S MAGIC IN THE LITTLE THINGS.", title: "Small heroes.\nBig adventures.", description: "Step into Bloomburrow. Your next story is waiting.", image: "/images/cards/valley-questcaller-art.jpg", primary: "Shop Bloomburrow", href: "/cards?set=blb", secondary: "Discover all sets", secondHref: "/cards", focalX: 50, focalY: 40 },
  { id: "default-mh3", enabled: true, eyebrow: "YOUR NEXT BIG PLAY IS HERE.", title: "More power.\nMore possibilities.", description: "Discover the game-changers in Modern Horizons 3.", image: "/images/cards/ulamog-the-defiler-art.jpg", primary: "Shop Modern Horizons 3", href: "/cards?set=mh3", secondary: "Browse Modern staples", secondHref: "/cards?category=modern-favourites", focalX: 50, focalY: 45 },
];
export const CAROUSEL_IMAGE_PATTERN = /^\/api\/carousel-images\/[a-f0-9-]{36}\.webp$/;
export function validCarouselImage(value: string) {
  return DEFAULT_CAROUSEL.some(slide => slide.image === value) || CAROUSEL_IMAGE_PATTERN.test(value);
}
export function validateCarousel(input: unknown): CarouselSlide[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) throw new Error("Keep between 1 and 12 slides.");
  const ids = new Set<string>();
  const slides = input.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Check each slide.");
    const data = entry as Record<string, unknown>;
    const text = (key: string, max: number, required = false) => {
      if (typeof data[key] !== "string") throw new Error(`Check slide ${key}.`);
      const value = data[key].trim();
      if ((required && !value) || value.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value)) throw new Error(`Check slide ${key} (maximum ${max} characters).`);
      return value;
    };
    const id = text("id", 80, true);
    if (!/^[a-zA-Z0-9-]+$/.test(id) || ids.has(id)) throw new Error("Each slide must have a unique ID.");
    ids.add(id);
    if (typeof data.enabled !== "boolean") throw new Error("Check slide visibility.");
    const image = text("image", 200, true);
    if (!validCarouselImage(image)) throw new Error("Choose a built-in image or upload a new image.");
    const link = (key: string) => {
      const value = text(key, 300);
      if (!value) return "";
      if (!value.startsWith("/") || value.startsWith("//") || /[\\\s<>\"']/.test(value) || new URL(value, "https://store.invalid").origin !== "https://store.invalid") throw new Error("Slide links must be store paths such as /cards?set=blb.");
      return value;
    };
    const primary = text("primary", 60), href = link("href"), secondary = text("secondary", 60), secondHref = link("secondHref");
    if (Boolean(primary) !== Boolean(href) || Boolean(secondary) !== Boolean(secondHref)) throw new Error("Give each button both a label and link, or leave both blank.");
    for (const key of ["focalX", "focalY"]) if (typeof data[key] !== "number" || !Number.isFinite(data[key]) || Number(data[key]) < 0 || Number(data[key]) > 100) throw new Error("Image focal points must be between 0 and 100.");
    return { id, enabled: data.enabled, eyebrow: text("eyebrow", 100), title: text("title", 160, true), description: text("description", 400), image, primary, href, secondary, secondHref, focalX: data.focalX as number, focalY: data.focalY as number };
  });
  if (!slides.some(slide => slide.enabled)) throw new Error("Keep at least one slide visible.");
  return slides;
}
