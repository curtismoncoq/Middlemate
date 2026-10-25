export class BudgetExceededError extends Error {}

export const usd = (atomic: bigint) => `$${(Number(atomic) / 1e7).toFixed(3).replace(/0$/, "")}`;

/** Off-chain spending cap enforced by the agent before every payment. */
export class BudgetGuard {
  private spent = 0n;
  constructor(private readonly capAtomic: bigint, alreadySpent = 0n) {
    this.spent = alreadySpent;
  }
  remaining(): bigint {
    return this.capAtomic > this.spent ? this.capAtomic - this.spent : 0n;
  }
  canSpend(a: bigint): boolean {
    return a <= this.remaining();
  }
  record(a: bigint): void {
    if (!this.canSpend(a)) throw new BudgetExceededError(`payment ${usd(a)} exceeds remaining budget ${usd(this.remaining())}`);
    this.spent += a;
  }
  spentAtomic(): bigint {
    return this.spent;
  }
}
