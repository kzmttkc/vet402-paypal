// The default suite must never reach the network. Any fetch here is a test bug.
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`network is disabled in npm test (tried ${String(input)})`);
}) as typeof fetch;
