import { useWallet } from "@solana/wallet-adapter-react";

const TOKENS = [
  { symbol: "SOL", value: "₹98,420.10" },
  { symbol: "USDC", value: "₹22,610.40" },
  { symbol: "JUP", value: "₹4,400.00" },
];

const PORTFOLIO_TOKENS = [
  { symbol: "SOL", value: 8123.21, change: 2.34 },
  { symbol: "USDC", value: 1000.0, change: 0.0 },
  { symbol: "ETH", value: 245000.55, change: -1.12 },
  { symbol: "BTC", value: 5820000.0, change: 0.85 },
  { symbol: "PENGU", value: 4200.0, change: 12.5 },
  { symbol: "JUP", value: 980.0, change: -3.4 },
];

export function ContextPanel() {
  const { publicKey } = useWallet();
  const userId = publicKey?.toBase58() ?? null;
  const portfolioTotal = PORTFOLIO_TOKENS.reduce((sum, token) => sum + token.value, 0);

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col gap-12 px-8 py-8 lg:flex">
      {/* Wallet */}
      <section>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Total Balance
        </div>
        <div className="mt-2 font-mono text-3xl font-medium tracking-tight text-foreground">
          ₹1,25,430.50
        </div>
        <div className="mt-3">
          <Sparkline />
        </div>
        <div className="mt-2 text-xs text-primary">+ 2.4% today</div>
      </section>

      {/* Tokens */}
      <section>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Tokens</div>
        <ul className="mt-3 space-y-2.5">
          {TOKENS.map((t) => (
            <li key={t.symbol} className="flex items-baseline justify-between font-mono text-sm">
              <span className="text-foreground">{t.symbol}</span>
              <span className="text-muted-foreground">{t.value}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Portfolio */}
      <section className="space-y-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Portfolio</div>
        <div className="text-lg font-semibold tracking-tight text-foreground">
          ₹{portfolioTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="space-y-3">
          {PORTFOLIO_TOKENS.map((token) => (
            <div
              key={token.symbol}
              className="flex items-center justify-between text-sm transition-colors hover:text-primary"
            >
              <div className="font-medium text-foreground">{token.symbol}</div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  ₹{token.value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-xs font-medium ${
                    token.change > 0
                      ? "text-green-400"
                      : token.change < 0
                        ? "text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {token.change > 0 ? "+" : ""}
                  {token.change}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 text-xs text-muted-foreground">Updated just now</div>
        <div className="font-mono text-[11px] text-muted-foreground/80">
          {userId ? `${userId.slice(0, 4)}...${userId.slice(-4)}` : "Connect wallet to load identity"}
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
