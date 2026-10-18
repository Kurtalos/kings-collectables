export type DeckLink = {
  site: "moxfield" | "archidekt" | "tappedout" | "mtggoldfish";
  deckId: string;
  url: string;
};

const PATTERNS: { site: DeckLink["site"]; match: RegExp }[] = [
  { site: "moxfield", match: /^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]{6,})/i },
  { site: "archidekt", match: /^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/decks\/(\d{4,})/i },
  { site: "tappedout", match: /^(?:https?:\/\/)?(?:www\.)?tappedout\.net\/mtg-decks\/([A-Za-z0-9-]{4,})/i },
  { site: "mtggoldfish", match: /^(?:https?:\/\/)?(?:www\.)?mtggoldfish\.com\/deck\/(\d{4,})/i },
];

const SITE_NAMES: Record<DeckLink["site"], string> = {
  moxfield: "Moxfield",
  archidekt: "Archidekt",
  tappedout: "TappedOut",
  mtggoldfish: "MTGGoldfish",
};

/** Recognises a pasted deck-builder URL and extracts the deck id. Returns null when the text is not a supported deck link. */
export function parseDeckLink(input: string): DeckLink | null {
  const text = input.trim().split(/\s+/)[0];
  if (!text || text.length > 300) return null;
  for (const pattern of PATTERNS) {
    const match = pattern.match.exec(text);
    if (match) return { site: pattern.site, deckId: match[1], url: text.startsWith("http") ? text : `https://${text}` };
  }
  return null;
}

export function isDeckLink(input: string): boolean {
  return parseDeckLink(input) !== null;
}

export const SITE_EXPORT_STEPS: Record<DeckLink["site"], { title: string; steps: string[]; note?: string }> = {
  moxfield: {
    title: "Copy the deck from Moxfield",
    steps: [
      "Open the deck on Moxfield",
      "Click the ⋮ (More) button near the top of the deck",
      "Choose Export → Plain Text",
      "Copy everything and paste it in the box below",
    ],
    note: "Moxfield blocks other websites from reading deck URLs directly, so the text export is the reliable way. It works for private decks you have access to too.",
  },
  archidekt: {
    title: "Copy the deck from Archidekt",
    steps: [
      "Open the deck on Archidekt",
      "Click the Export button (or use the deck's Export menu)",
      "Choose the plain text / MTG format",
      "Copy everything and paste it in the box below",
    ],
  },
  tappedout: {
    title: "Copy the deck from TappedOut",
    steps: [
      "Open the deck on TappedOut",
      "Click Export at the top of the deck",
      "Choose the plain text format",
      "Copy everything and paste it in the box below",
    ],
  },
  mtggoldfish: {
    title: "Copy the deck from MTGGoldfish",
    steps: [
      "Open the deck on MTGGoldfish",
      "Click the Export button on the deck page",
      "Choose the plain text format",
      "Copy everything and paste it in the box below",
    ],
  },
};

export function siteName(site: DeckLink["site"]): string {
  return SITE_NAMES[site];
}
