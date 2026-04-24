import { createFileRoute } from "@tanstack/react-router";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, Connection, clusterApiUrl } from "@solana/web3.js";
import { Search, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createContact, listContacts, type Contact } from "@/lib/contacts";

type QueryType = "tx" | "wallet";
type ExplorerNetwork = "devnet" | "mainnet-beta";

type ExplorerResult =
  | {
      kind: "tx";
      summary: TxSummary;
    }
  | {
      kind: "wallet";
      address: string;
      balanceSol: number;
      network: ExplorerNetwork;
      recent: WalletActivity[];
    };

type WalletActivity = {
  signature: string;
  label: string;
  timeLabel: string;
  status: "success" | "pending" | "failed";
};

type TxSummary = {
  status: "success" | "pending" | "failed";
  headline: string;
  amountLabel: string;
  valueInrLabel: string;
  fromLabel: string;
  toLabel: string;
  toAddress?: string;
  feeLabel: string;
  timeLabel: string;
  network: string;
  cluster: ExplorerNetwork;
  signature: string;
  flags: string[];
};

const INR_RATES: Record<string, number> = {
  SOL: 8090.44,
  USDC: 94.16,
};

export const Route = createFileRoute("/app/launch")({
  head: () => ({
    meta: [
      { title: "Explorer — CryptoChat" },
      {
        name: "description",
        content: "Human-first Solana explorer that translates transactions into clear summaries.",
      },
    ],
  }),
  component: ExplorerPage,
});

function ExplorerPage() {
  const { publicKey } = useWallet();
  const userId = publicKey?.toBase58() ?? null;
  const [selectedNetwork, setSelectedNetwork] = useState<ExplorerNetwork>("devnet");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const queryType = useMemo(() => detectType(query.trim()), [query]);
  const rpcConnection = useMemo(
    () => new Connection(clusterApiUrl(selectedNetwork), "confirmed"),
    [selectedNetwork],
  );

  useEffect(() => {
    if (!userId) {
      setContacts([]);
      return;
    }

    listContacts(userId)
      .then((response) => setContacts(response.contacts))
      .catch(() => setContacts([]));
  }, [userId]);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();

    const input = query.trim();
    if (!input) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchExplorerData(rpcConnection, input, selectedNetwork);
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not fetch explorer data.";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [selectedNetwork]);

  return (
    <div className="min-h-screen px-6 py-8 sm:px-12">
      <header className="pb-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Explorer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a wallet or transaction signature. We translate chain data into plain language.
        </p>
      </header>

      <section className="w-full space-y-6">
        <form
          onSubmit={(event) => {
            void handleSearch(event);
          }}
          className="rounded-2xl border border-border-subtle bg-gradient-to-r from-surface/90 via-surface/70 to-primary/10 p-5 shadow-sm"
        >
          <label
            htmlFor="explorer-query"
            className="block text-xs uppercase tracking-wider text-muted-foreground"
          >
            Search
          </label>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border-subtle bg-background/70 px-3">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="explorer-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter wallet address or transaction signature..."
              className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-background/60 px-3 py-1">
              <span>
                Detected: {query.trim() ? (queryType === "tx" ? "Transaction" : "Wallet") : "Unknown"}
              </span>
              <span>•</span>
              <span>{selectedNetwork === "devnet" ? "Devnet" : "Mainnet"}</span>
            </div>
            <div className="inline-flex h-11 items-center rounded-xl border border-border-subtle bg-background/70 p-1">
              <button
                type="button"
                onClick={() => setSelectedNetwork("devnet")}
                className={`h-9 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selectedNetwork === "devnet"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Devnet
              </button>
              <button
                type="button"
                onClick={() => setSelectedNetwork("mainnet-beta")}
                className={`h-9 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selectedNetwork === "mainnet-beta"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mainnet
              </button>
            </div>
            <button
              type="submit"
              disabled={!query.trim() || loading}
              className="h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-glow disabled:cursor-not-allowed disabled:bg-muted-foreground/30 disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {result ? (
          <ExplorerResultView
            data={result}
            contacts={contacts}
            userId={userId}
            onContactsChanged={setContacts}
          />
        ) : null}
      </section>
    </div>
  );
}

function ExplorerResultView({
  data,
  contacts,
  userId,
  onContactsChanged,
}: {
  data: ExplorerResult;
  contacts: Contact[];
  userId: string | null;
  onContactsChanged: (next: Contact[]) => void;
}) {
  if (data.kind === "tx") {
    return (
      <TxView
        summary={data.summary}
        contacts={contacts}
        userId={userId}
        onContactSaved={(saved) => onContactsChanged([saved, ...contacts])}
      />
    );
  }

  return <WalletView data={data} />;
}

function TxView({
  summary,
  contacts,
  userId,
  onContactSaved,
}: {
  summary: TxSummary;
  contacts: Contact[];
  userId: string | null;
  onContactSaved: (contact: Contact) => void;
}) {
  const [contactName, setContactName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const matchedContact = summary.toAddress
    ? contacts.find((contact) => contact.wallet === summary.toAddress)
    : undefined;

  const recipientLabel = matchedContact
    ? `@${matchedContact.name} (${summary.toLabel})`
    : summary.toLabel;

  async function handleSaveRecipient() {
    if (!userId || !summary.toAddress) {
      return;
    }

    const name = contactName.trim();
    if (!name) {
      setSaveError("Enter a contact name.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await createContact(userId, {
        name,
        wallet: summary.toAddress,
      });

      if (!response.contact) {
        throw new Error("Could not save contact.");
      }

      onContactSaved(response.contact);
      setContactName("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save contact.");
    } finally {
      setIsSaving(false);
    }
  }

  const statusTone =
    summary.status === "success"
      ? "border-primary/40 bg-primary/10 text-primary"
      : summary.status === "pending"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface/70 p-6 shadow-sm">
      <div className="rounded-xl border border-border-subtle bg-gradient-to-br from-primary/15 via-background to-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-medium text-foreground sm:text-xl">{summary.headline}</h2>
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone}`}>
            {humanStatus(summary.status)}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{summary.timeLabel}</p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailBlock label="Amount" value={summary.amountLabel} mono />
        <DetailBlock label="Value" value={summary.valueInrLabel} mono tone="emerald" />
        <DetailBlock label="Fee" value={summary.feeLabel} mono />
        <DetailBlock label="Network" value={summary.network} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DetailBlock label="From" value={summary.fromLabel} />
        <DetailBlock label="To" value={recipientLabel} tone="blue" />
      </div>

      {summary.toAddress ? (
        matchedContact ? (
          <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
            Contact recognized: @{matchedContact.name}
            <div className="mt-1 font-mono text-xs text-muted-foreground">{summary.toAddress}</div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border-subtle bg-background/70 p-4">
            <div className="text-sm text-foreground">Recipient not in your contacts.</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{summary.toAddress}</div>
            {userId ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Save as name (e.g. pooja)"
                  className="h-10 min-w-[220px] rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveRecipient()}
                  disabled={isSaving}
                  className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow disabled:cursor-not-allowed disabled:bg-muted-foreground/30 disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {isSaving ? "Saving..." : "Save to contacts"}
                </button>
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">Connect wallet to save this address to contacts.</div>
            )}
            {saveError ? <div className="mt-2 text-xs text-destructive">{saveError}</div> : null}
          </div>
        )
      ) : null}

      {summary.flags.length > 0 ? (
        <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="text-xs uppercase tracking-wider text-warning">Smart Insights</div>
          {summary.flags.map((flag) => (
            <p key={flag} className="mt-2 text-sm text-warning">
              ⚠ {flag}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border-subtle bg-background/70 px-4 py-3 text-xs text-muted-foreground">
        <span className="uppercase tracking-wider">Txn</span>
        <a
          href={explorerTxUrl(summary.signature, summary.cluster)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary transition-colors hover:text-primary-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {short(summary.signature, 5)}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}

function WalletView({ data }: { data: Extract<ExplorerResult, { kind: "wallet" }> }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface/70 p-6 shadow-sm">
      <div className="rounded-xl border border-border-subtle bg-gradient-to-br from-blue-500/15 via-background to-background p-5">
        <h2 className="text-lg font-medium text-foreground">Wallet Overview</h2>
        <p className="mt-2 font-mono text-2xl text-foreground">{formatNumber(data.balanceSol)} SOL</p>
        <p className="mt-1 text-sm text-emerald-400">{formatInr(data.balanceSol * INR_RATES.SOL)}</p>
      </div>

      <div className="mt-6">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Recent Activity</h3>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.recent.length === 0 ? (
            <li className="text-sm text-muted-foreground">No recent transactions found.</li>
          ) : (
            data.recent.map((item) => (
              <li key={item.signature} className="rounded-xl border border-border-subtle bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground">{item.label}</p>
                  <span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-xs text-muted-foreground">
                    {item.timeLabel}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={
                      item.status === "success"
                        ? "text-primary"
                        : item.status === "pending"
                          ? "text-warning"
                          : "text-destructive"
                    }
                  >
                    {humanStatus(item.status)}
                  </span>
                  <span>•</span>
                  <a
                    href={explorerTxUrl(item.signature, data.network)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary transition-colors hover:text-primary-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {short(item.signature, 5)} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </article>
  );
}

function DetailBlock({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "emerald" | "blue";
}) {
  const toneClass = tone === "emerald" ? "border-emerald-400/20 bg-emerald-400/10" : tone === "blue" ? "border-blue-400/20 bg-blue-400/10" : "border-border-subtle bg-background/60";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function detectType(input: string): QueryType {
  if (input.length > 80) {
    return "tx";
  }

  return "wallet";
}

async function fetchExplorerData(
  connection: Connection,
  input: string,
  network: ExplorerNetwork,
): Promise<ExplorerResult> {
  const type = detectType(input);

  if (type === "tx") {
    const tx = await connection.getParsedTransaction(input, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) {
      throw new Error(
        `Transaction not found on ${network === "devnet" ? "devnet" : "mainnet"}.`,
      );
    }

    return {
      kind: "tx",
      summary: toTxSummary(tx, input, network),
    };
  }

  const address = new PublicKey(input);
  const [lamports, signatures] = await Promise.all([
    connection.getBalance(address, "confirmed"),
    connection.getSignaturesForAddress(address, { limit: 6 }, "confirmed"),
  ]);

  return {
    kind: "wallet",
    address: address.toBase58(),
    balanceSol: lamports / LAMPORTS_PER_SOL,
    network,
    recent: signatures.map((s) => ({
      signature: s.signature,
      label: s.err ? "Transaction failed" : "Transaction confirmed",
      timeLabel: s.blockTime ? timeAgo(s.blockTime * 1000) : "unknown time",
      status: s.err ? "failed" : s.confirmationStatus === "processed" ? "pending" : "success",
    })),
  };
}

function toTxSummary(
  tx: Awaited<ReturnType<Connection["getParsedTransaction"]>>,
  signature: string,
  network: ExplorerNetwork,
): TxSummary {
  if (!tx) {
    throw new Error("Missing transaction data.");
  }

  const transfer = extractTransfer(tx);
  const feeSol = (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL;
  const status: TxSummary["status"] = tx.meta?.err ? "failed" : "success";

  if (!transfer) {
    return {
      status,
      headline: "Parsed transaction found (non-transfer program)",
      amountLabel: "Unknown",
      valueInrLabel: "Unknown",
      fromLabel: short(signature, 4),
      toLabel: "Unknown",
      toAddress: undefined,
      feeLabel: `${feeSol.toFixed(6)} SOL`,
      timeLabel: tx.blockTime ? timeAgo(tx.blockTime * 1000) : "unknown time",
      network: `Solana ${network === "devnet" ? "Devnet" : "Mainnet"}`,
      cluster: network,
      signature,
      flags: ["Could not map this transaction to a simple transfer summary"],
    };
  }

  const amountInr = transfer.amount * INR_RATES.SOL;
  const flags: string[] = [];

  if (transfer.amount * INR_RATES.SOL > 5000) {
    flags.push("Large transaction (>₹5,000)");
  }
  flags.push("First time interacting (heuristic)");

  return {
    status,
    headline: `Sent ${formatNumber(transfer.amount)} SOL to ${short(transfer.to, 4)}`,
    amountLabel: `${formatNumber(transfer.amount)} SOL`,
    valueInrLabel: formatInr(amountInr),
    fromLabel: short(transfer.from, 4),
    toLabel: short(transfer.to, 4),
    toAddress: transfer.to,
    feeLabel: `${feeSol.toFixed(6)} SOL`,
    timeLabel: tx.blockTime ? timeAgo(tx.blockTime * 1000) : "unknown time",
    network: `Solana ${network === "devnet" ? "Devnet" : "Mainnet"}`,
    cluster: network,
    signature,
    flags,
  };
}

function extractTransfer(
  tx: Awaited<ReturnType<Connection["getParsedTransaction"]>>,
): { from: string; to: string; amount: number } | null {
  if (!tx) {
    return null;
  }

  const instruction = tx.transaction.message.instructions.find(
    (ix) => "program" in ix && ix.program === "system" && "parsed" in ix,
  );

  if (!instruction || !("parsed" in instruction)) {
    return null;
  }

  const parsed = instruction.parsed;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const info = "info" in parsed ? (parsed as { info?: Record<string, unknown> }).info : undefined;
  const source = info?.source;
  const destination = info?.destination;
  const lamports = info?.lamports;

  if (typeof source !== "string" || typeof destination !== "string" || typeof lamports !== "number") {
    return null;
  }

  return {
    from: source,
    to: destination,
    amount: lamports / LAMPORTS_PER_SOL,
  };
}

function short(value: string, chars = 4) {
  if (value.length <= chars * 2 + 3) {
    return value;
  }
  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

function humanStatus(status: "success" | "pending" | "failed") {
  if (status === "success") {
    return "Confirmed";
  }
  if (status === "pending") {
    return "Pending";
  }
  return "Failed";
}

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: value < 10 ? 2 : 0,
    maximumFractionDigits: 4,
  });
}

function timeAgo(timestampMs: number) {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.floor(diffMs / (60 * 1000));

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

function explorerTxUrl(signature: string, network: ExplorerNetwork) {
  if (network === "mainnet-beta") {
    return `https://explorer.solana.com/tx/${signature}`;
  }

  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
