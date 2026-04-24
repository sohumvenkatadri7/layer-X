import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Coins, ImageIcon, Wallet } from "lucide-react";
import { loadWalletAssets, truncateAddress, type OwnedNft, type OwnedToken } from "@/lib/wallet-assets";

type AssetsState = {
  solBalance: number;
  tokens: OwnedToken[];
  nfts: OwnedNft[];
};

export function WalletAssets() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [assets, setAssets] = useState<AssetsState>({ solBalance: 0, tokens: [], nfts: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || !connected) {
      setAssets({ solBalance: 0, tokens: [], nfts: [] });
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchAssets() {
      setLoading(true);
      setError(null);

      try {
        const nextAssets = await loadWalletAssets(connection, publicKey);
        if (!cancelled) {
          setAssets(nextAssets);
        }
      } catch (requestError) {
        if (!cancelled) {
          setAssets({ solBalance: 0, tokens: [], nfts: [] });
          setError(
            requestError instanceof Error ? requestError.message : "Could not load wallet assets.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchAssets();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, connected]);

  const totalAssets = 1 + assets.tokens.length + assets.nfts.length;

  return (
    <div className="px-6 py-8 sm:px-12">
      <header className="pb-12">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Assets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All assets held by the connected wallet, including SOL, SPL tokens, and NFTs.
        </p>
      </header>

      {!connected || !publicKey ? (
        <section className="max-w-3xl rounded-2xl border border-border-subtle bg-surface/60 p-6">
          <div className="text-sm text-muted-foreground">
            Connect your wallet to view tokens, NFTs, and native SOL balance.
          </div>
        </section>
      ) : error ? (
        <section className="max-w-3xl rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </section>
      ) : (
        <div className="space-y-8">
          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              icon={Wallet}
              label="Native SOL"
              value={`${assets.solBalance.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`}
            />
            <SummaryCard icon={Coins} label="SPL Tokens" value={String(assets.tokens.length)} />
            <SummaryCard icon={ImageIcon} label="NFTs" value={String(assets.nfts.length)} />
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface/40 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Overview</div>
                <h2 className="mt-1 text-lg font-medium text-foreground">Wallet inventory</h2>
              </div>
              <div className="rounded-full border border-border-subtle bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                {loading ? "Refreshing..." : `${totalAssets} asset groups`}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface/40 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">NFTs on Devnet</div>
                <h2 className="mt-1 text-lg font-medium text-foreground">Collected NFTs</h2>
              </div>
              <div className="rounded-full border border-border-subtle bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                {assets.nfts.length} found
              </div>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-28 animate-pulse rounded-xl border border-border-subtle bg-background/60"
                    />
                  ))}
                </div>
              ) : assets.nfts.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-background/70 p-4 text-sm text-muted-foreground">
                  No NFT-like token accounts found on devnet for this wallet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {assets.nfts.map((nft, index) => (
                    <div
                      key={nft.mint}
                      className="rounded-2xl border border-border-subtle bg-background/70 p-4 shadow-sm transition-transform hover:-translate-y-0.5"
                    >
                      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface/80">
                        {nft.image ? (
                          <img
                            src={nft.image}
                            alt={nft.name ? `${nft.name} NFT` : `NFT ${index + 1}`}
                            className="h-28 w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary/20 via-surface to-sky-500/10">
                            <div className="text-center">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                No image
                              </div>
                              <div className="mt-2 font-mono text-sm text-foreground">
                                {truncateAddress(nft.mint)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">
                        {nft.symbol || `NFT #${index + 1}`}
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {nft.name || truncateAddress(nft.mint)}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {truncateAddress(nft.mint)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-surface/40 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Tokens</div>
                <h2 className="mt-1 text-lg font-medium text-foreground">Native SOL and SPL balances</h2>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-border-subtle bg-background/70 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">SOL</div>
                <div className="mt-1 text-xl font-medium text-foreground">
                  {assets.solBalance.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Native balance on Solana devnet.</div>
              </div>

              {loading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-24 animate-pulse rounded-2xl border border-border-subtle bg-background/60"
                    />
                  ))}
                </div>
              ) : assets.tokens.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-background/70 p-4 text-sm text-muted-foreground">
                  No SPL token balances found for this wallet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {assets.tokens.map((token) => (
                    <div
                      key={token.mint}
                      className="rounded-2xl border border-border-subtle bg-background/70 p-4"
                    >
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        SPL Token
                      </div>
                      <div className="mt-1 text-lg font-medium text-foreground">
                        {token.uiAmountString}
                      </div>
                      <div className="mt-2 font-mono text-xs text-muted-foreground">
                        Mint: {truncateAddress(token.mint)}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        Account: {truncateAddress(token.tokenAccount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface/50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-2xl font-medium text-foreground">{value}</div>
    </div>
  );
}
