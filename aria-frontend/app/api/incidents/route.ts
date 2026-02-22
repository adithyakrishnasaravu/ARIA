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

export async function GET(): Promise<Response> {
  const backendUrl = `${resolveBackendBaseUrl()}/incidents`;
  const headers = new Headers();

  const backendApiKey = process.env.ARIA_BACKEND_API_KEY ?? process.env.ARIA_API_KEY;
  if (backendApiKey) {
    headers.set("x-aria-api-key", backendApiKey);
  }

  try {
    const upstream = await fetch(backendUrl, { headers, cache: "no-store" });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch {
    return Response.json(
      { error: "ARIA frontend proxy could not reach backend /incidents." },
      { status: 502 },
    );
  }
}
