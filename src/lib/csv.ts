export function parseCSV(input: string): { headers: string[]; rows: string[][] } {
  const text = input.replace(/^\uFEFF/, "");
  const result: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += character;
    } else if (character === '"' && !cell && !closed) quoted = true;
    else if (character === ",") { row.push(cell.trim()); cell = ""; closed = false; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) result.push(row);
      row = []; cell = ""; closed = false;
    } else if (closed && character.trim()) throw new Error("Unexpected text after a quoted value. Please check your CSV.");
    else if (!closed) cell += character;
  }
  if (quoted) throw new Error("An unfinished quoted value was found. Please check your CSV.");
  row.push(cell.trim());
  if (row.some(Boolean)) result.push(row);
  if (result.length < 2) throw new Error("Your CSV needs a header and at least one card row.");
  const headers = result.shift()!;
  if (new Set(headers.map(h => h.toLowerCase())).size !== headers.length) throw new Error("Column names must be unique.");
  if (result.length > 1000) throw new Error("Please import up to 1,000 rows at a time.");
  for (let i = 0; i < result.length; i++) if (result[i].length !== headers.length) throw new Error(`Row ${i + 2} has ${result[i].length} values, but the header has ${headers.length}. Quote any card names containing commas.`);
  return { headers, rows: result };
}
export const CSV_TEMPLATE = 'name,set,collector_number,quantity,price,condition,finish,category\n"Ragavan, Nimble Pilferer",mh2,,2,49.90,Near mint,Non-foil,Modern favourites\nSol Ring,cmm,,10,3.50,Near mint,Non-foil,Commander staples\n';
export function downloadCSV(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
