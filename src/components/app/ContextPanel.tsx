import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { loadWalletPortfolio, type WalletPortfolio } from "@/lib/wallet-assets";

type WatchlistItem = {
  symbol: string;
  valueInInr: number | null;
};

const WATCHLIST = [
  { symbol: "SOL", id: "solana" },
  { symbol: "JUP", id: "jupiter-exchange-solana" },
  { symbol: "ETH", id: "ethereum" },
  { symbol: "BTC", id: "bitcoin" },
] as const;

export function ContextPanel() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [portfolio, setPortfolio] = useState<WalletPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWatchlist() {
      setWatchlistLoading(true);

      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${WATCHLIST.map((item) => item.id).join(",")}&vs_currencies=inr`,
        );

        if (!response.ok) {
          throw new Error("Unable to load watchlist prices.");
        }

        const data = (await response.json()) as Record<string, { inr?: number }>;
        if (!cancelled) {
          setWatchlist(
            WATCHLIST.map((item) => ({
              symbol: item.symbol,
              valueInInr: data[item.id]?.inr ?? null,
            })),
          );
        }
      } catch {
        if (!cancelled) {
          setWatchlist([]);
        }
      } finally {
        if (!cancelled) {
          setWatchlistLoading(false);
        }
      }
    }

    void loadWatchlist();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setPortfolio(null);
      setLoading(false);
      return;
    }

    const owner = publicKey;

    let cancelled = false;

    async function loadPortfolio() {
      setLoading(true);

      try {
        const nextPortfolio = await loadWalletPortfolio(connection, owner);
        if (!cancelled) {
          setPortfolio(nextPortfolio);
        }
      } catch {
        if (!cancelled) {
          setPortfolio(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPortfolio();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  const formattedBalance = portfolio?.solBalance.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

  const formattedPortfolioValue = formatInr(portfolio?.totalValueInInr ?? null);

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-12 px-8 py-8 lg:flex">
      {/* Wallet */}
      <section>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Balance</div>
        <div className="mt-2 font-mono text-3xl font-medium tracking-tight text-foreground">
          {publicKey ? (loading ? "Loading..." : `${formattedBalance ?? "0.0000"} SOL`) : "Connect wallet"}
          <div className="mt-2 text-xl text-muted-foreground">{formattedPortfolioValue}</div>
        </div>
        <div className="mt-3">
          <Sparkline />
        </div>
        <div className="mt-2 text-xs text-primary">Live wallet valuation</div>
      </section>

      {/* Portfolio */}
      <section>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Portfolio</div>
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
            </div>
          ) : portfolio?.holdings.length ? (
            portfolio.holdings.map((token) => (
              <div
                key={`${token.mint}-${token.tokenAccount}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/30 px-3 py-2 transition-colors hover:bg-surface/60"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-medium text-foreground">
                    {token.symbol}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {token.uiAmountString}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-foreground">{token.valueLabel}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {token.symbol === "SOL" ? "native balance" : "live quote"}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border/60 bg-surface/30 px-3 py-4 text-sm text-muted-foreground">
              Connect a wallet to load live holdings.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Live token values</div>
        <div className="mt-3 space-y-2.5">
          {watchlistLoading ? (
            <>
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
              <div className="h-10 animate-pulse rounded-lg bg-surface/70" />
            </>
          ) : watchlist.length ? (
            watchlist.map((token) => (
              <div
                key={token.symbol}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-surface/30 px-3 py-2"
              >
                <div>
                  <div className="font-mono text-sm font-medium text-foreground">{token.symbol}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">current market value</div>
                </div>
                <div className="font-mono text-sm text-foreground">{formatInr(token.valueInInr)}</div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border/60 bg-surface/30 px-3 py-3 text-sm text-muted-foreground">
              Market prices unavailable right now.
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

function Sparkline() {
  // tiny static trend line
  const points = [6, 8, 5, 9, 7, 11, 10, 13, 12, 15, 14, 17];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 220;
  const h = 36;
  const stepX = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-primary">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

function formatInr(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "₹—";
  }

  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
