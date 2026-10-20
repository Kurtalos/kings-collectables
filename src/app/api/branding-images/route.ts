import { requireOwner, apiError } from "@/lib/admin-auth";
import { MAX_BRAND_BYTES, storeBrandingImage } from "@/lib/branding-images";
export const runtime="nodejs";
export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const tooLarge=()=>Response.json({error:"Choose an image up to 4 MB."},{status:413});
    if (Number(request.headers.get("content-length"))>MAX_BRAND_BYTES) return tooLarge();
    const kind=new URL(request.url).searchParams.get("kind") || "logo";
    if (!["logo","icon"].includes(kind)) throw new Error("Choose a logo or icon upload.");
    const reader=request.body?.getReader(); if (!reader) throw new Error("Choose an image.");
    const chunks: Uint8Array[]=[]; let size=0;
    while(true) { const chunk=await reader.read(); if (chunk.done) break; size+=chunk.value.byteLength; if(size>MAX_BRAND_BYTES) { await reader.cancel(); return tooLarge(); } chunks.push(chunk.value); }
    return Response.json({image:await storeBrandingImage(Buffer.concat(chunks),request.headers.get("content-type") || "",kind)},{status:201,headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return apiError(error); }
}
