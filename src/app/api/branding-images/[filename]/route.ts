import { readBrandingImage } from "@/lib/branding-images";
export const runtime="nodejs";
export async function GET(_request: Request,{params}:{params:Promise<{filename:string}>}) {
  try {
    const {filename}=await params, image=await readBrandingImage(filename);
    if(!image) return new Response("Image not found",{status:404});
    return new Response(new Uint8Array(image),{headers:{"Content-Type":filename.endsWith(".png") ? "image/png" : "image/webp","Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  } catch { return new Response("Unable to read image",{status:500}); }
}
