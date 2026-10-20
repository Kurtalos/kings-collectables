import { requireOwner,apiError } from "@/lib/admin-auth";
import { readBody } from "@/lib/validation";
import { readChromeRecord,updateChrome } from "@/lib/site-chrome-server";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){try{await requireOwner(request);return Response.json({record:await readChromeRecord()},{headers});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{await requireOwner(request);const body=await readBody(request);return Response.json({record:await updateChrome(body.content,body.revision,body.action)},{headers});}catch(e){return apiError(e,e instanceof Error&&e.message.includes("another tab") ? 409:400);}}
