import { requireOwner, apiError } from '@/lib/admin-auth';
export async function POST(request:Request) {
 try { await requireOwner(request); return Response.json({error:'Use Receive stock / CSV intake. Legacy selling-price and replace-stock imports are disabled.'},{status:410}); }
 catch(error) { return apiError(error); }
}
