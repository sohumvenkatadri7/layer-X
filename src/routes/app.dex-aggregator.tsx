import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpDown, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type JupiterQuote = {
  outAmount: string;
  routePlan?: Array<{
    swapInfo?: {
      label?: string;
    };
  }>;
};

type SupportedChain = "solana" | "ethereum" | "polygon" | "arbitrum" | "base";

type TokenInfo = {
  mint: string;
  decimals: number;
};

type ParsedDexCommand = {
  amount: number;
  fromSymbol: string;
  toSymbol: string;
  chain: SupportedChain;
};

type DexComparison = {
  chain: SupportedChain;
  amount: number;
  fromSymbol: string;
  toSymbol: string;
  smartRoute: {
    outAmount: number;
    dexLabels: string[];
  };
  poolQuotes: Array<{
    poolName: string;
    outAmount: number;
    available: boolean;
  }>;
  bestPool: {
    poolName: string;
    outAmount: number;
  } | null;
  savingsInInr: number;
  recommended: "smart";
};

const SOL_INR = 8090;

const SOLANA_TOKENS: Record<string, TokenInfo> = {
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  JUP: { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
};

const INR_RATES: Partial<Record<SupportedChain, Record<string, number>>> = {
  solana: {
    SOL: 8090,
    USDC: 83,
    USDT: 83,
    JUP: 50,
  },
  ethereum: {
    ETH: 240000,
    USDC: 83,
    USDT: 83,
  },
  polygon: {
    POL: 65,
    USDC: 83,
    USDT: 83,
  },
  arbitrum: {
    ETH: 240000,
    USDC: 83,
    USDT: 83,
  },
  base: {
    ETH: 240000,
    USDC: 83,
    USDT: 83,
  },
};

const TOKENS_BY_CHAIN: Record<SupportedChain, string[]> = {
  solana: ["SOL", "USDC", "USDT", "JUP"],
  ethereum: ["ETH", "USDC", "USDT"],
  polygon: ["POL", "USDC", "USDT"],
  arbitrum: ["ETH", "USDC", "USDT"],
  base: ["ETH", "USDC", "USDT"],
};

const CHAIN_DEFAULTS: Record<SupportedChain, { from: string; to: string }> = {
  solana: { from: "SOL", to: "USDC" },
  ethereum: { from: "ETH", to: "USDC" },
  polygon: { from: "POL", to: "USDC" },
  arbitrum: { from: "ETH", to: "USDC" },
  base: { from: "ETH", to: "USDC" },
};

const CHAIN_META: Record<SupportedChain, { label: string; logo: string }> = {
  solana: {
    label: "Solana",
    logo: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png",
  },
  ethereum: {
    label: "Ethereum",
    logo: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png",
  },
  polygon: {
    label: "Polygon",
    logo: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/matic.png",
  },
  arbitrum: {
    label: "Arbitrum",
    logo: "https://cryptologos.cc/logos/arbitrum-arb-logo.png",
  },
  base: {
    label: "Base",
    logo: "https://cryptologos.cc/logos/base-base-logo.png",
  },
};

const TOKEN_LOGOS: Record<string, string> = {
  SOL: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png",
  USDC: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/usdc.png",
  USDT: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/usdt.png",
  ETH: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png",
  POL: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/matic.png",
};

export const Route = createFileRoute("/app/dex-aggregator")({
  head: () => ({
    meta: [
      { title: "DEX Aggregator — layer-x" },
      {
        name: "description",
        content: "Compare Jupiter smart routing against direct pool quotes for SOL to USDC swaps.",
      },
    ],
  }),
  component: DexAggregatorPage,
});

function DexAggregatorPage() {
  const [chain, setChain] = useState<SupportedChain>("solana");
  const [fromSymbol, setFromSymbol] = useState("SOL");
  const [toSymbol, setToSymbol] = useState("USDC");
  const [amountInput, setAmountInput] = useState("10");
  const [comparison, setComparison] = useState<DexComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenOptions = TOKENS_BY_CHAIN[chain];

  const hint = useMemo(() => {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Enter a valid amount to run a quote audit.";
    }

    return `Ready to audit ${amount} ${fromSymbol} to ${toSymbol} on ${chain}.`;
  }, [amountInput, fromSymbol, toSymbol, chain]);

  function handleFlipTokens() {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
    setComparison(null);
  }

  function handleChainChange(nextChain: SupportedChain) {
    setChain(nextChain);
    setFromSymbol(CHAIN_DEFAULTS[nextChain].from);
    setToSymbol(CHAIN_DEFAULTS[nextChain].to);
    setComparison(null);
    setError(null);
  }

  async function handleAudit(event?: React.FormEvent) {
    event?.preventDefault();

    const amount = Number(amountInput);

    if (!Number.isFinite(amount) || amount <= 0) {
      setComparison(null);
      setError("Enter a valid numeric amount to continue.");
      return;
    }

    if (fromSymbol === toSymbol) {
      setComparison(null);
      setError("Choose two different tokens to compare routes.");
      return;
    }

    const parsed: ParsedDexCommand = {
      amount,
      fromSymbol,
      toSymbol,
      chain,
    };

    if (parsed.chain !== "solana") {
      setComparison(null);
      setError(
        `Chain ${parsed.chain} is parsed, but only the Solana Jupiter adapter is active right now. Use 'on solana'.`,
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await compareJupiterQuotes(parsed);
      setComparison({
        chain: parsed.chain,
        amount: parsed.amount,
        fromSymbol: parsed.fromSymbol,
        toSymbol: parsed.toSymbol,
        smartRoute: {
          outAmount: result.smartRoute.outAmount,
          dexLabels: result.smartRoute.dexLabels,
        },
        poolQuotes: result.poolQuotes,
        bestPool: result.bestPool,
        savingsInInr: result.savingsInInr,
        recommended: "smart",
      });
    } catch (auditError) {
      setComparison(null);
      setError(auditError instanceof Error ? auditError.message : "Failed to fetch Jupiter quotes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-12">
      <header className="pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-primary text-primary-foreground">DEX Auditor</Badge>
          <Badge variant="outline" className="border-border-subtle text-muted-foreground">
            Smart route comparison
          </Badge>
        </div>
        <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">DEX Aggregator</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Swap token, fetch aggregated and pool-level quotes in parallel,
          and surface the best execution path.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form
          onSubmit={(event) => {
            void handleAudit(event);
          }}
          className="rounded-3xl border border-border-subtle bg-linear-to-br from-surface via-surface/80 to-primary/10 p-7 shadow-sm"
        >
          <label className="block text-sm font-medium tracking-wide text-muted-foreground">Swap Builder</label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border-subtle bg-background/70 px-4">
              <label htmlFor="swap-amount" className="mt-3 block text-xs uppercase text-muted-foreground">
                Amount
              </label>
              <input
                id="swap-amount"
                type="number"
                min="0"
                step="any"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                className="h-12 w-full bg-transparent text-base font-medium text-foreground outline-none"
              />
            </div>

            <div className="rounded-2xl border border-border-subtle bg-background/70 px-4 pb-3">
              <label htmlFor="swap-chain" className="mt-3 block text-xs uppercase text-muted-foreground">
                Chain
              </label>
              <Select
                value={chain}
                onValueChange={(value) => handleChainChange(value as SupportedChain)}
              >
                <SelectTrigger id="swap-chain" className="mt-1 h-12 rounded-xl border-border-subtle bg-background/60 text-base font-medium">
                  <SelectValue>
                    <ChainOption chain={chain} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHAIN_META) as SupportedChain[]).map((chainKey) => (
                    <SelectItem key={chainKey} value={chainKey}>
                      <ChainOption chain={chainKey} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-2xl border border-border-subtle bg-background/70 px-4 pb-3">
              <label htmlFor="from-token" className="mt-3 block text-xs uppercase text-muted-foreground">
                From
              </label>
              <Select
                value={fromSymbol}
                onValueChange={(value) => setFromSymbol(value)}
              >
                <SelectTrigger id="from-token" className="mt-1 h-12 rounded-xl border-border-subtle bg-background/60 text-base font-medium">
                  <SelectValue>
                    <TokenOption symbol={fromSymbol} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {tokenOptions.map((symbol) => (
                    <SelectItem key={`from-${symbol}`} value={symbol}>
                      <TokenOption symbol={symbol} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              onClick={handleFlipTokens}
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-background/70 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Flip tokens"
            >
              <ArrowUpDown className="h-5 w-5" />
            </button>

            <div className="rounded-2xl border border-border-subtle bg-background/70 px-4 pb-3">
              <label htmlFor="to-token" className="mt-3 block text-xs uppercase text-muted-foreground">
                To
              </label>
              <Select
                value={toSymbol}
                onValueChange={(value) => setToSymbol(value)}
              >
                <SelectTrigger id="to-token" className="mt-1 h-12 rounded-xl border-border-subtle bg-background/60 text-base font-medium">
                  <SelectValue>
                    <TokenOption symbol={toSymbol} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {tokenOptions.map((symbol) => (
                    <SelectItem key={`to-${symbol}`} value={symbol}>
                      <TokenOption symbol={symbol} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-background/60 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5" />
              {hint}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-background/60 px-3 py-1">
              Reference: 1 SOL = ₹{SOL_INR.toLocaleString("en-IN")}
            </span>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Pool comparison is calculated from Jupiter V6 quotes with Layer-X server-side proxying.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-glow disabled:cursor-not-allowed disabled:bg-muted-foreground/30 disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {loading ? "Auditing..." : "Run Audit"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-border-subtle bg-surface/70 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Profit / Loss</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">
                {comparison ? formatInr(comparison.savingsInInr) : "₹0"}
              </div>
            </div>
            <Badge variant={comparison && comparison.savingsInInr >= 0 ? "default" : "destructive"}>
              {comparison ? (comparison.savingsInInr >= 0 ? "Profit" : "Loss") : "Awaiting quote"}
            </Badge>
          </div>

          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <p>
              This stat compares the smart route output against the best single-pool output and
              converts the difference into INR using the Layer-X quote model.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Table rows below compare named pools, and the final row highlights the best available
              pool for this pair.
            </p>
          </div>

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </section>

      {comparison ? (
        <section className="mt-6 rounded-2xl border border-border-subtle bg-surface/70 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-medium text-foreground">Price Comparison</h2>
          </div>

          <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-primary">Best Pool Highlight</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {comparison.bestPool ? comparison.bestPool.poolName : "No pool quote available"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Best Output</p>
                <p className="mt-1 font-mono text-base font-semibold text-foreground">
                  {comparison.bestPool
                    ? `${formatNumber(comparison.bestPool.outAmount)} ${comparison.toSymbol}`
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-140 border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Quoted Output</th>
                  <th className="px-3 py-2 font-medium">DEX / Route</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle/70">
                  <td className="px-3 py-3 text-foreground">Smart Route</td>
                  <td className="px-3 py-3 font-mono text-foreground">
                    {formatNumber(comparison.smartRoute.outAmount)} {comparison.toSymbol}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {comparison.smartRoute.dexLabels.length > 0
                      ? comparison.smartRoute.dexLabels.join(", ")
                      : "No route labels returned"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">Primary route</td>
                </tr>
                {comparison.poolQuotes.map((quote) => (
                  <tr key={quote.poolName} className="border-b border-border-subtle/50">
                    <td className="px-3 py-3 text-foreground">{quote.poolName}</td>
                    <td className="px-3 py-3 font-mono text-foreground">
                      {quote.available ? `${formatNumber(quote.outAmount)} ${comparison.toSymbol}` : "N/A"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{quote.poolName}</td>
                    <td className="px-3 py-3">
                      {quote.available ? <Badge variant="outline">Compared</Badge> : <Badge variant="destructive">Unavailable</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-border-subtle bg-surface/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-primary text-primary-foreground">
            {comparison?.recommended === "smart" ? "Recommended Action" : "Smart Route Priority"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {comparison
              ? `Execute the smart route when it yields a higher ${comparison.toSymbol} outAmount.`
              : "Run a quote audit to see the recommended route."}
          </span>
        </div>
      </section>
    </div>
  );
}

async function compareJupiterQuotes(parsed: ParsedDexCommand) {
  const fromToken = SOLANA_TOKENS[parsed.fromSymbol];
  const toToken = SOLANA_TOKENS[parsed.toSymbol];

  if (!fromToken || !toToken) {
    throw new Error(
      `Unsupported token symbol for Solana adapter. Supported: ${Object.keys(SOLANA_TOKENS).join(", ")}.`,
    );
  }

  const amount = Math.round(parsed.amount * 10 ** fromToken.decimals);
  const apiBase =
    import.meta.env.VITE_CONTACTS_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:8787");
  const [aggregatedResponse] = await Promise.all([
    fetch(
      `${apiBase}/jupiter/quote?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${amount}&slippageBps=50`,
    ),
  ]);

  const aggregatedPayload = await aggregatedResponse.text();

  if (!aggregatedResponse.ok) {
    throw new Error(
      `Failed to fetch aggregated Jupiter quote. ${aggregatedPayload || `HTTP ${aggregatedResponse.status}`}`,
    );
  }

  const aggregatedQuote = JSON.parse(aggregatedPayload) as JupiterQuote;

  const poolCandidates = Array.from(
    new Set([
      ...extractDexLabels(aggregatedQuote.routePlan),
      "Orca V2",
      "Raydium CPMM",
      "Meteora DLMM",
      "Lifinity V2",
    ]),
  );

  const perPoolResponses = await Promise.all(
    poolCandidates.map(async (poolName) => {
      const res = await fetch(
        `${apiBase}/jupiter/quote?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${amount}&slippageBps=50&dexes=${encodeURIComponent(poolName)}`,
      );

      if (!res.ok) {
        return { poolName, available: false, outAmount: 0 };
      }

      const payload = (await res.json()) as JupiterQuote;
      const outAmount = Number(payload.outAmount ?? 0) / 10 ** toToken.decimals;
      return { poolName, available: outAmount > 0, outAmount };
    }),
  );

  const availablePools = perPoolResponses
    .filter((pool) => pool.available)
    .sort((a, b) => b.outAmount - a.outAmount);

  const bestPool = availablePools[0] ?? null;
  const smartOutAmount = Number(aggregatedQuote.outAmount ?? 0) / 10 ** toToken.decimals;
  const bestSinglePoolOutAmount = bestPool?.outAmount ?? 0;
  const inputInrRate = INR_RATES[parsed.chain]?.[parsed.fromSymbol] ?? 0;
  const inputNotionalInr = parsed.amount * inputInrRate;
  const improvementRatio =
    smartOutAmount > 0 ? (smartOutAmount - bestSinglePoolOutAmount) / smartOutAmount : 0;
  const savingsInInr = inputNotionalInr * improvementRatio;

  return {
    smartRoute: {
      outAmount: smartOutAmount,
      dexLabels: extractDexLabels(aggregatedQuote.routePlan),
    },
    poolQuotes: perPoolResponses,
    bestPool: bestPool
      ? {
          poolName: bestPool.poolName,
          outAmount: bestPool.outAmount,
        }
      : null,
    savingsInInr,
  };
}

function extractDexLabels(routePlan?: JupiterQuote["routePlan"]) {
  const labels = (routePlan ?? [])
    .map((step) => step.swapInfo?.label?.trim())
    .filter((label): label is string => Boolean(label));

  return Array.from(new Set(labels));
}

function TokenOption({ symbol }: { symbol: string }) {
  const logo = TOKEN_LOGOS[symbol];

  return (
    <span className="flex items-center gap-2">
      {logo ? (
        <img src={logo} alt={`${symbol} logo`} className="h-5 w-5 rounded-full" loading="lazy" />
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {symbol.slice(0, 2)}
        </span>
      )}
      <span>{symbol}</span>
    </span>
  );
}

function ChainOption({ chain }: { chain: SupportedChain }) {
  const meta = CHAIN_META[chain];

  return (
    <span className="flex items-center gap-2">
      <img src={meta.logo} alt={`${meta.label} logo`} className="h-5 w-5 rounded-full" loading="lazy" />
      <span>{meta.label}</span>
    </span>
  );
}

function formatInr(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}