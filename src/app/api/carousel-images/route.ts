import { requireOwner, apiError } from "@/lib/admin-auth";
import { MAX_IMAGE_BYTES, storeCarouselImage } from "@/lib/carousel-images";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireOwner(request);
    if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES) return Response.json({ error: "Choose an image up to 8 MB." }, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Choose an image to upload.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); return Response.json({ error: "Choose an image up to 8 MB." }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const image = await storeCarouselImage(Buffer.concat(chunks), request.headers.get("content-type") || "");
    return Response.json({ image }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
