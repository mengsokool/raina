export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Normalizes Fetch & Hono responses. Parses JSON or extracts detailed error messages.
 */
export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as any;
    let errorMessage: string | undefined;

    if (typeof body?.error === "string") {
      errorMessage = body.error;
    } else if (typeof body?.message === "string") {
      errorMessage = body.message;
    } else if (Array.isArray(body?.error?.issues)) {
      errorMessage = body.error.issues
        .map((i: any) => `${i.path?.join(".") || "field"}: ${i.message}`)
        .join(", ");
    } else if (Array.isArray(body?.issues)) {
      errorMessage = body.issues
        .map((i: any) => `${i.path?.join(".") || "field"}: ${i.message}`)
        .join(", ");
    } else if (typeof body?.error === "object" && body?.error !== null) {
      errorMessage = JSON.stringify(body.error);
    }

    throw new HttpError(
      errorMessage || `Request failed with status ${response.status}`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
