// Use Next.js API proxy to avoid CORS preflight to the Python backend.
const PATH_ENDPOINT = "/api/path";

export type FastestPathRequest = {
  origin: {
    lat: number;
    lon: number;
    radius_m: number;
    max_candidates: number;
  };
  end_stop_id: string;
  departure_time: string;
  algorithm: string;
};

export type FastestPathResponse = unknown;

export async function fetchFastestPath(
  payload: FastestPathRequest,
  opts?: { signal?: AbortSignal }
): Promise<FastestPathResponse> {
  const res = await fetch(PATH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const suffix = text ? ` - ${text}` : "";
    throw new Error(`Fastest path request failed (${res.status})${suffix}`);
  }

  return res.json();
}
