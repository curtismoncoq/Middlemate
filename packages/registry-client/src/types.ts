export type Listing = {
  /** Stable per-listing ID; absent on legacy provider-keyed entries. */
  id?: string;
  exitAt?: number;
  retired?: boolean;
  provider: string;
  name: string;
  endpoint: string;
  claimedModel: string;
  /** price per request, token atomic units (USDC: 7 decimals) */
  priceAtomic: bigint;
  stakeAtomic: bigint;
  active: boolean;
};

export type NewListing = Omit<Listing, 'provider' | 'stakeAtomic' | 'active' | 'id' | 'exitAt' | 'retired'>;
export type TxResult = { hash: string };

export interface RegistryClient {
  list(): Promise<Listing[]>;
  get(provider: string): Promise<Listing | null>;
  isActive(provider: string): Promise<boolean>;
  register(secret: string, l: NewListing): Promise<TxResult>;
  stake(secret: string, amountAtomic: bigint): Promise<TxResult>;
  slash(auditorSecret: string, provider: string): Promise<TxResult & { amountAtomic: bigint }>;
  pauseListing(auditorSecret: string, provider: string): Promise<TxResult>;
  /** removes a listing and refunds remaining stake; signer must be the provider or the admin */
  unregister(secret: string, provider: string): Promise<TxResult & { refundedAtomic: bigint }>;
}

export interface EndpointRegistryMethods {
  getEndpoint(id: string): Promise<Listing | null>;
  isEndpointActive(id: string): Promise<boolean>;
  registerEndpoint(secret: string, id: string, listing: NewListing, initialStake: bigint): Promise<TxResult>;
  stakeEndpoint(secret: string, id: string, amount: bigint): Promise<TxResult>;
  renameEndpoint(secret: string, id: string, name: string): Promise<TxResult>;
  requestExit(secret: string, id: string): Promise<TxResult>;
  cancelExit(secret: string, id: string): Promise<TxResult>;
  withdrawEndpoint(secret: string, id: string): Promise<TxResult & { refundedAtomic: bigint }>;
  slashEndpoint(secret: string, id: string): Promise<TxResult & { amountAtomic: bigint }>;
  pauseEndpoint(secret: string, id: string): Promise<TxResult>;
}

export interface MarketplaceRegistryClient extends RegistryClient, EndpointRegistryMethods {}
export const listingKey = (listing: Pick<Listing, 'id' | 'provider'>) => listing.id ?? listing.provider;
export async function isListingActive(registry: Pick<RegistryClient, 'isActive'> & Partial<EndpointRegistryMethods>, listing: Listing) {
  if (!listing.id) return registry.isActive(listing.provider);
  if (!registry.isEndpointActive) throw new Error('Registry client does not support per-listing IDs');
  return registry.isEndpointActive(listing.id);
}

export const USDC_DECIMALS = 7;
export const toAtomic = (usd: number) => BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
export const fromAtomic = (a: bigint) => Number(a) / 10 ** USDC_DECIMALS;
