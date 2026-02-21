export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveBackendBaseUrl(): string {
  const backendBaseUrl =
    process.env.ARIA_BACKEND_BASE_URL ??
    process.env.NEXT_PUBLIC_ARIA_API_BASE_URL ??
    "http://localhost:4000";
  return normalizeBaseUrl(backendBaseUrl);
}

export async function POST(request: Request): Promise<Response> {
  const backendUrl = `${resolveBackendBaseUrl()}/incidents/investigate`;
  const rawBody = await request.text();
  const headers = new Headers({
    "Content-Type": request.headers.get("content-type") ?? "application/json",
  });

  const backendApiKey = process.env.ARIA_BACKEND_API_KEY ?? process.env.ARIA_API_KEY;
  if (backendApiKey) {
    headers.set("x-aria-api-key", backendApiKey);
  }

  try {
    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: rawBody,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (
        key.toLowerCase() !== "content-length" &&
        key.toLowerCase() !== "connection" &&
        key.toLowerCase() !== "transfer-encoding"
      ) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "ARIA frontend proxy could not reach backend /incidents/investigate." },
      { status: 502 },
    );
  }
}
