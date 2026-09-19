import type { Route } from "./+types/api-proxy";

const targetBase = process.env.INTERNAL_API_URL || "http://127.0.0.1:3001";

async function forward(request: Request, params: Record<string, string | undefined>) {
  const url = new URL(request.url);
  const subPath = params["*"] || "";
  const targetUrl = new URL(`/v1/${subPath}${url.search}`, targetBase);

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  return fetch(targetUrl.toString(), init);
}

export const loader = ({ request, params }: Route.LoaderArgs) => forward(request, params);
export const action = ({ request, params }: Route.ActionArgs) => forward(request, params);
