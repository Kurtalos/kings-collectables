export function parseCSV(input: string, tolerateRowWidths = false): { headers: string[]; rows: string[][]; errors: Record<number,string> } {
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
  const errors:Record<number,string>={};
  for (let i = 0; i < result.length; i++) if (result[i].length !== headers.length) {
    const message=`Row ${i + 2} has ${result[i].length} values, but the header has ${headers.length}. Quote card names containing commas.`;
    if(!tolerateRowWidths) throw new Error(message);
    errors[i]=message;
  }
  return { headers, rows: result, errors };
}
export const CSV_TEMPLATE = 'name,scryfall_id,set,collector_number,quantity,condition,finish,acquisition_type,unit_cost_aud,supplier,reference,date,note\nSol Ring,,cmm,396,2,Near mint,Non-foil,Purchase,1.50,Local collection,RCPT-001,,"Confirm printing before import"\n';
export function downloadCSV(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
