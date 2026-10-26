export type BadgeLookupResult =
  | { kind: "found"; name: string }
  | { kind: "not-found" }
  | { kind: "verify-error" }
  | { kind: "access-error"; signedOut: boolean };

/** Frames stay on-device. Only the decoded value crosses this same-origin boundary. */
export async function lookupScannerBadge(
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BadgeLookupResult> {
  try {
    const response = await fetcher("/api/scanner/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
      credentials: "same-origin",
      mode: "same-origin",
      redirect: "error",
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "access-error", signedOut: response.status === 401 };
    }
    if ([400, 404, 413, 415].includes(response.status)) return { kind: "not-found" };
    if (response.status !== 200) return { kind: "verify-error" };
    const body: unknown = await response.json();
    if (body && typeof body === "object" && Object.keys(body).length === 1 && "name" in body && typeof body.name === "string") {
      return { kind: "found", name: body.name };
    }
  } catch {
    // Network failures and unexpected responses never become an invalid-badge result.
  }
  return { kind: "verify-error" };
}
