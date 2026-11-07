export type Transport = <T>(path: string, body?: unknown) => Promise<T>;

async function fetchTransport<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "The request failed.");
  return data;
}

let transport: Transport = fetchTransport;

export function setTransport(next: Transport): void {
  transport = next;
}

export function api<T>(path: string, body?: unknown): Promise<T> {
  return transport<T>(path, body);
}
