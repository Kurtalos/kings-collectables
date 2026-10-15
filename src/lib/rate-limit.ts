const windows = new Map<string, { start: number; count: number }>();
export function limitPublicRequests(request: Request, action: string, maximum = 8): Response | null {
  const now = Date.now(), duration = 60000;
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const key = `${action}:${address}`;
  if (windows.size > 5000) for (const [entry, value] of windows) if (now - value.start >= duration) windows.delete(entry);
  const prior = windows.get(key);
  if (prior && now - prior.start < duration) {
    if (prior.count >= maximum) return Response.json({ error: "A few too many requests. Please wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((duration - (now - prior.start)) / 1000))) } });
    prior.count++;
  } else windows.set(key, { start: now, count: 1 });
  return null;
}
