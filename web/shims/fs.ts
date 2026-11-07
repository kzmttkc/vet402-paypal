function refused(): never {
  throw new Error("the static demo does not read files");
}

export function readFileSync(): never {
  return refused();
}

export function existsSync(): boolean {
  return false;
}

export function statSync(): never {
  return refused();
}

export function readFile(): Promise<never> {
  return Promise.reject(new Error("the static demo does not read files"));
}
