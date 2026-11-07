/** The static demo scores with the deterministic scorer and never loads a model. */
export const env = { cacheDir: "", allowLocalModels: false };

export function pipeline(): Promise<never> {
  return Promise.reject(new Error("the static demo does not load an embedding model"));
}
