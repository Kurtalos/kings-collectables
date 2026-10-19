import PDFDocument from "pdfkit";
import path from "node:path";
import type { PickLine } from "./picklist";

/** Each order starts on a fresh A4 page; long orders repeat their heading and columns. */
export async function picklistPDF(lines: PickLine[], storeName = "Kings Collectables"): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36, autoFirstPage: false,
    info: { Title: `${storeName} — Order picklists`, Author: storeName } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const fonts = path.join(process.cwd(), "src/assets/fonts");
  doc.registerFont("regular", path.join(fonts, "DejaVuSans.ttf"));
  doc.registerFont("bold", path.join(fonts, "DejaVuSans-Bold.ttf"));
  const orders = new Map<string, PickLine[]>();
  for (const line of lines) {
    const group = orders.get(line.orderNumber) ?? [];
    group.push(line);
    orders.set(line.orderNumber, group);
  }
  const widths = [26, 34, 183, 48, 56, 79, 97];
  const labels = ["Pick", "Qty", "Card name", "Set", "Number", "Finish", "Condition"];
  let page = 0;
  for (const [number, items] of orders) {
    let y = 0;
    let part = 0;
    const heading = () => {
      doc.addPage(); page++; part++;
      doc.font("bold").fontSize(17).fillColor("#161616").text(storeName.toUpperCase(), 36, 32, { width: 523, height: 22, ellipsis: true });
      doc.font("regular").fontSize(9).fillColor("#555555").text(`ORDER PICKLIST  •  Packing  •  Page ${page}`, 36, 58);
      doc.font("bold").fontSize(13).fillColor("#161616").text(`Order ${number}${part > 1 ? " — continued" : ""}`, 36, 80, { width: 523 });
      doc.font("regular").fontSize(10).text(`Customer: ${items[0].customerName || "Not recorded"}`, 36, doc.y + 7, { width: 523 });
      doc.fontSize(9).text(`${items.length} lines  •  ${items.reduce((sum, item) => sum + item.quantity, 0)} cards`, 36, doc.y + 6);
      y = doc.y + 14;
      doc.rect(36, y, 523, 25).fill("#eeeeee");
      let x = 36;
      labels.forEach((label, i) => {
        doc.font("bold").fontSize(8).fillColor("#111111").text(label, x + 4, y + 7, { width: widths[i] - 8 }); x += widths[i];
      });
      y += 25;
    };
    heading();
    for (const item of items) {
      const missing = !item.setCode || !item.collectorNumber || !item.finish || !item.condition;
      const cells = ["", String(item.quantity), item.cardName + (missing && item.variant ? `\nRecorded variant: ${item.variant}` : ""), item.setCode?.toUpperCase() || "Unknown", item.collectorNumber || "Unknown", item.finish || "Unknown", item.condition || "Unknown"];
      doc.font("regular").fontSize(8);
      const height = Math.max(35, ...cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - 8 }) + 16));
      if (y + height > 782) heading();
      let x = 36;
      cells.forEach((text, i) => {
        doc.rect(x, y, widths[i], height).lineWidth(0.5).strokeColor("#cccccc").stroke();
        if (i === 0) doc.rect(x + 7, y + 11, 11, 11).strokeColor("#555555").stroke();
        else doc.font(i === 1 ? "bold" : "regular").fontSize(8).fillColor("#111111").text(text, x + 4, y + 8, { width: widths[i] - 8 });
        x += widths[i];
      });
      y += height;
    }
  }
  doc.end();
  return output;
}
