/** Emergency stop. Checked at decision time and again right before every money-moving rail call. */
export class KillSwitch {
  private reason: string | null = null;

  engage(reason: string): void {
    if (this.reason === null) this.reason = reason;
  }

  get engaged(): boolean {
    return this.reason !== null;
  }

  get why(): string | null {
    return this.reason;
  }
}
