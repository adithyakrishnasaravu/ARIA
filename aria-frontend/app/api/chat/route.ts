export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveBackendBaseUrl(): string {
  const url =
    process.env.ARIA_BACKEND_BASE_URL ??
    process.env.NEXT_PUBLIC_ARIA_API_BASE_URL ??
    "http://localhost:3011";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function POST(request: Request): Promise<Response> {
  const backendUrl = `${resolveBackendBaseUrl()}/chat`;
  const rawBody = await request.text();

  try {
    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!["content-length", "connection", "transfer-encoding"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Could not reach ARIA backend /chat." }, { status: 502 });
  }
}
