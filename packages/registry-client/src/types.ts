export type Listing = {
  provider: string;
  name: string;
  endpoint: string;
  claimedModel: string;
  /** price per request, token atomic units (USDC: 7 decimals) */
  priceAtomic: bigint;
  stakeAtomic: bigint;
  active: boolean;
};

export type NewListing = Omit<Listing, 'provider' | 'stakeAtomic' | 'active'>;
export type TxResult = { hash: string };

export interface RegistryClient {
  list(): Promise<Listing[]>;
  get(provider: string): Promise<Listing | null>;
  isActive(provider: string): Promise<boolean>;
  register(secret: string, l: NewListing): Promise<TxResult>;
  stake(secret: string, amountAtomic: bigint): Promise<TxResult>;
  slash(auditorSecret: string, provider: string): Promise<TxResult & { amountAtomic: bigint }>;
  pauseListing(auditorSecret: string, provider: string): Promise<TxResult>;
}

export const USDC_DECIMALS = 7;
export const toAtomic = (usd: number) => BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
export const fromAtomic = (a: bigint) => Number(a) / 10 ** USDC_DECIMALS;
