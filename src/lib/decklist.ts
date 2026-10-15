export type ParsedCard = {
  line: number;
  name: string;
  quantity: number;
  section: string;
  setCode?: string;
  collectorNumber?: string;
  error?: string;
};

export type ParseResult = { cards: ParsedCard[]; warnings: string[] };

const SECTION_WORDS = new Set(["deck", "maindeck", "main deck", "main", "commander", "sideboard", "maybeboard", "companion"]);
export const MAX_DECK_LINES = 400;
export const MAX_UNIQUE_CARDS = 200;
export const MAX_QTY_PER_LINE = 999;

export function normaliseName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}
export function frontFace(value: string) {
  const split = value.split(/\s+\/\/\s+|\s*\/\/\s*/);
  return (split[0] || value).trim();
}

/** Parses a pasted Magic decklist in the common Arena / Moxfield / Archidekt / plain-text exports. */
export function parseDecklist(text: string): ParseResult {
  const cards: ParsedCard[] = [];
  const warnings: string[] = [];
  let section = "Maindeck";
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length > MAX_DECK_LINES) throw new Error(`Please paste up to ${MAX_DECK_LINES} lines at a time.`);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    // A leading // is a comment; the // double-faced separator never starts a line.
    if (/^(\/\/|#|<|>)/.test(line) || /^(decklist|created by|about|author)/i.test(line)) return;

    const heading = line.replace(/[:•]+$/, "").trim();
    if (SECTION_WORDS.has(heading.toLowerCase())) {
      section = heading.toLowerCase() === "main" || heading.toLowerCase() === "deck" ? "Maindeck" : heading.charAt(0).toUpperCase() + heading.slice(1).toLowerCase();
      return;
    }

    let working = line;
    let explicitCount: number | null = null;

    const labelled = working.match(/^(sb|sideboard|maybeboard|cmdr|commander|companion)\s*:\s*(.+)$/i);
    if (labelled) {
      section = labelled[1].toLowerCase().startsWith("sb") || labelled[1].toLowerCase() === "sideboard" ? "Sideboard" : labelled[1].toLowerCase().startsWith("maybe") ? "Maybeboard" : "Commander";
      working = labelled[2].trim();
    }

    // Up to four digits so obvious typos reach the quantity cap check instead of becoming card names.
    let countMatch = working.match(/^(\d{1,4})\s*[x×*]?\s+(.+)$/i);
    if (!countMatch) countMatch = working.match(/^(\d{1,4})\s+(.+)$/i);
    if (countMatch) { explicitCount = Number(countMatch[1]); working = countMatch[2].trim(); }
    else {
      const trailing = working.match(/^(.+?)\s+[x×*]\s*(\d{1,4})$/i);
      if (trailing) { explicitCount = Number(trailing[2]); working = trailing[1].trim(); }
    }

    let setCode: string | undefined, collectorNumber: string | undefined;
    const annotated = working.match(/^(.*?)\s*\(([a-z0-9]{2,8})\)\s*([a-z0-9]+)?\s*$/i);
    if (annotated) { working = annotated[1].trim(); setCode = annotated[2].toLowerCase(); collectorNumber = annotated[3]; }
    // Foil markers must be checked before set-code tags so *FOIL* is not read as a set.
    const foilTag = working.match(/^(.*?)\s*\*(F|FOIL)\*\s*$/i);
    if (foilTag) working = foilTag[1].trim();
    const starred = working.match(/^(.*?)\s*\*([A-Z0-9]{2,5})\*\s*$/);
    if (starred) { working = starred[1].trim(); if (!setCode) setCode = starred[2].toLowerCase(); }
    const mtga = working.match(/^(.*?)\s*\[\d{1,3}:\d{1,3}\]\s*$/);
    if (mtga) working = mtga[1].trim();

    const name = working.replace(/\s{2,}/g, " ").trim();
    const quantity = explicitCount === null ? 1 : explicitCount;
    const entry: ParsedCard = { line: index + 1, name, quantity, section, setCode, collectorNumber };

    if (!name || name.length > 200) { entry.error = "Could not read a card name on this line."; cards.push(entry); return; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) { entry.error = `Quantity must be 1 to ${MAX_QTY_PER_LINE}.`; cards.push(entry); return; }
    if (setCode && !/^[a-z0-9]{2,8}$/.test(setCode)) { entry.error = `Unrecognised set code “${setCode}”.`; cards.push(entry); return; }
    if (/^(https?:\/\/|www\.)/i.test(name)) { entry.error = "Paste card names, not links."; cards.push(entry); return; }
    cards.push(entry);
  });

  if (!cards.length) throw new Error("No cards found. Paste a list like “4 Lightning Bolt”, one card per line.");
  if (cards.length > MAX_DECK_LINES) throw new Error(`Please paste up to ${MAX_DECK_LINES} lines at a time.`);

  const merged = new Map<string, ParsedCard>();
  for (const card of cards) {
    if (card.error) continue;
    const key = `${normaliseName(card.name)}|${card.section}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = Math.min(MAX_QTY_PER_LINE, existing.quantity + card.quantity);
      if (!existing.setCode && card.setCode) { existing.setCode = card.setCode; existing.collectorNumber = card.collectorNumber; }
      existing.line = Math.min(existing.line, card.line);
      warnings.push(`Merged duplicate lines for ${card.name} (${card.section}).`);
    } else merged.set(key, { ...card });
  }

  const resolved = [...cards.filter(card => card.error), ...merged.values()].sort((a, b) => a.line - b.line);
  const unique = new Set(merged.keys());
  if (unique.size > MAX_UNIQUE_CARDS) throw new Error(`This list has ${unique.size} different cards. Please paste up to ${MAX_UNIQUE_CARDS} at a time.`);
  return { cards: resolved, warnings: [...new Set(warnings)].slice(0, 5) };
}
