import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";
import { displayContactName, listContacts, type Contact } from "@/lib/contacts";

type TxSummary = {
  type: "send" | "swap";
  status: "success" | "pending" | "failed";
  from: string;
  to: string;
  fromName?: string;
  toName?: string;
  amount: number;
  token: string;
  receivedAmount?: number;
  receivedToken?: string;
  fee: number;
  network: string;
  timestamp: number;
  signature: string;
  flags?: string[];
};

const INR_RATES: Record<string, number> = {
  SOL: 8090.44,
  USDC: 94.16,
  JUP: 50,
  ETH: 240000,
  BTC: 0,
};

const STATUS_UI: Record<TxSummary["status"], { label: string; className: string }> = {
  success: { label: "Confirmed", className: "text-primary" },
  pending: { label: "Pending", className: "text-warning" },
  failed: { label: "Failed", className: "text-destructive" },
};

export const Route = createFileRoute("/app/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — layer-x" },
      { name: "description", content: "Human-readable transaction explorer on Solana." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [txs, setTxs] = useState<TxSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const userId = publicKey?.toBase58() ?? null;

  const contactNameByWallet = useMemo(() => {
    return new Map(contacts.map((contact) => [contact.wallet, displayContactName(contact.name)]));
  }, [contacts]);

  useEffect(() => {
    if (!userId) {
      setContacts([]);
      return;
    }

    let cancelled = false;

    listContacts(userId)
      .then((response) => {
        if (!cancelled) {
          setContacts(response.contacts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContacts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!publicKey) {
      setTxs([]);
      setError(null);
      setLoading(false);
      return;
    }

    const owner = publicKey;
    let cancelled = false;

    async function loadTransactions() {
      setLoading(true);
      setError(null);

      try {
        const signatures = await connection.getSignaturesForAddress(owner, { limit: 8 }, "confirmed");
        const parsedTransactions = await Promise.all(
          signatures.map(async (entry) => {
            const transaction = await connection.getParsedTransaction(entry.signature, {
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            });

            return toTxSummary(transaction, entry.signature, owner.toBase58(), contactNameByWallet);
          }),
        );

        if (!cancelled) {
          setTxs(parsedTransactions.filter(Boolean) as TxSummary[]);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Could not load transactions.");
          setTxs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTransactions();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  return (
    <div className="px-6 py-8 sm:px-12">
      <header className="pb-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Simplified Explorer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clear transaction stories instead of raw instruction logs.
        </p>
      </header>

      <section className="space-y-4">
        {!publicKey ? (
          <div className="rounded-xl border border-border-subtle bg-surface/60 p-5 text-sm text-muted-foreground">
            Connect your wallet to load recent transactions.
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <div className="h-36 animate-pulse rounded-xl border border-border-subtle bg-surface/60" />
            <div className="h-36 animate-pulse rounded-xl border border-border-subtle bg-surface/60" />
            <div className="h-36 animate-pulse rounded-xl border border-border-subtle bg-surface/60" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {error}
          </div>
        ) : txs.length ? (
          txs.map((tx) => <TxExplorerCard key={tx.signature} tx={tx} />)
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface/60 p-5 text-sm text-muted-foreground">
            No recent transactions found for this wallet.
          </div>
        )}
      </section>
    </div>
  );
}

function TxExplorerCard({ tx }: { tx: TxSummary }) {
  const status = STATUS_UI[tx.status];
  const valueInr = getValueInr(tx);
  const fromLabel = tx.fromName ?? shortAddress(tx.from);
  const toLabel = tx.toName ?? shortAddress(tx.to);

  return (
    <article className="rounded-xl border border-border-subtle bg-surface/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-medium text-foreground">{headline(tx)}</h2>
        <div className={`shrink-0 text-xs font-medium ${status.className}`}>
          {statusEmoji(tx.status)} {status.label}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <DetailRow label="Amount" value={`${formatAmount(tx.amount)} ${tx.token}`} mono />
        <DetailRow label="Value" value={formatInr(valueInr)} mono />

        {tx.type === "swap" && tx.receivedAmount && tx.receivedToken ? (
          <>
            <DetailRow
              label="You get"
              value={`${formatAmount(tx.receivedAmount)} ${tx.receivedToken}`}
              mono
            />
            <DetailRow
              label="Rate"
              value={`1 ${tx.token} = ${formatAmount(tx.receivedAmount / tx.amount)} ${tx.receivedToken}`}
              mono
            />
          </>
        ) : null}

        <PartyRow label="To" value={toLabel} address={tx.to} />
        <PartyRow label="From" value={fromLabel} address={tx.from} />
        <DetailRow label="Fee" value={`${tx.fee.toFixed(6)} SOL`} mono />
        <DetailRow label="Network" value={tx.network} />
        <DetailRow label="Time" value={timeAgo(tx.timestamp)} />
      </div>

      {tx.flags && tx.flags.length > 0 ? (
        <div className="mt-4 space-y-1.5">
          {tx.flags.map((flag) => (
            <p key={flag} className="text-xs text-warning">
              ⚠ {flag}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="uppercase tracking-wider">Txn</span>
        <a
          href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary transition-colors hover:text-primary-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {shortAddress(tx.signature, 5)} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-5">
      <span className="w-20 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-foreground`}>{value}</span>
    </div>
  );
}

function PartyRow({
  label,
  value,
  address,
}: {
  label: string;
  value: string;
  address: string;
}) {
  return (
    <div className="flex items-start gap-5">
      <span className="w-20 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="min-w-0">
        <div className="font-medium text-foreground">{value}</div>
        <div className="font-mono text-xs text-muted-foreground">{address}</div>
      </div>
    </div>
  );
}

function headline(tx: TxSummary) {
  if (tx.type === "send") {
    return `Sent ${formatAmount(tx.amount)} ${tx.token} to ${tx.toName ?? shortAddress(tx.to)}`;
  }

  return `Swapped ${formatAmount(tx.amount)} ${tx.token} to ${formatAmount(tx.receivedAmount ?? 0)} ${tx.receivedToken ?? ""}`;
}

function getValueInr(tx: TxSummary) {
  const rate = INR_RATES[tx.token] ?? 0;
  return tx.amount * rate;
}

function toTxSummary(
  tx: Awaited<ReturnType<typeof import("@solana/web3.js").Connection.prototype.getParsedTransaction>>,
  signature: string,
  owner: string,
  contactNameByWallet: Map<string, string>,
): TxSummary | null {
  if (!tx) {
    return null;
  }

  const fee = (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL;
  const status: TxSummary["status"] = tx.meta?.err ? "failed" : "success";
  const timestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();
  const transfer = findSystemTransfer(tx, owner);

  if (transfer) {
    const amount = transfer.amount;
    const token = "SOL";
    const fromName = nameForWallet(transfer.from, owner, contactNameByWallet);
    const toName = nameForWallet(transfer.to, owner, contactNameByWallet);

    return {
      type: "send",
      status,
      from: transfer.from,
      to: transfer.to,
      fromName,
      toName,
      amount,
      token,
      fee,
      network: "Solana",
      timestamp,
      signature,
      flags: tx.meta?.err ? ["Transaction failed"] : [],
    };
  }

  const summary = summarizeTokenTransfer(tx, owner);
  if (summary) {
    return {
      ...summary,
      status,
      fee,
      timestamp,
      signature,
    };
  }

  return {
    type: "send",
    status,
    from: owner,
    to: shortAddress(signature, 6),
    fromName: "You",
    amount: 0,
    token: "SOL",
    fee,
    network: "Solana",
    timestamp,
    signature,
    flags: ["Could not fully decode this transaction"],
  };
}

function findSystemTransfer(
  tx: Awaited<ReturnType<typeof import("@solana/web3.js").Connection.prototype.getParsedTransaction>>,
  owner: string,
) {
  const instruction = tx?.transaction.message.instructions.find(
    (ix) => "program" in ix && ix.program === "system" && "parsed" in ix,
  );

  if (!instruction || !("parsed" in instruction)) {
    return null;
  }

  const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
  if (!parsed || parsed.type !== "transfer") {
    return null;
  }

  const source = parsed.info?.source;
  const destination = parsed.info?.destination;
  const lamports = parsed.info?.lamports;

  if (typeof source !== "string" || typeof destination !== "string" || typeof lamports !== "number") {
    return null;
  }

  if (source !== owner && destination !== owner) {
    return null;
  }

  return {
    from: source,
    to: destination,
    amount: lamports / LAMPORTS_PER_SOL,
  };
}

function summarizeTokenTransfer(
  tx: Awaited<ReturnType<typeof import("@solana/web3.js").Connection.prototype.getParsedTransaction>>,
  owner: string,
): TxSummary | null {
  const instructions = tx?.transaction.message.instructions ?? [];

  for (const instruction of instructions) {
    if (!("parsed" in instruction) || !instruction.program) {
      continue;
    }

    if (instruction.program === "spl-token") {
      const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> };
      const type = parsed.type;
      const info = parsed.info ?? {};
      const amount = typeof info.amount === "string" ? Number(info.amount) / 1_000_000 : null;
      const mint = typeof info.mint === "string" ? info.mint : null;
      const authority = typeof info.authority === "string" ? info.authority : null;
      const destination = typeof info.destination === "string" ? info.destination : null;

      if (!mint || amount == null) {
        continue;
      }

      const token = symbolForMint(mint);

      if (type === "transfer" || type === "transferChecked") {
        const fromName = authority === owner ? "You" : undefined;
        const toName = destination === owner ? "You" : undefined;
        return {
          type: "send",
          status: tx?.meta?.err ? "failed" : "success",
          from: authority ?? owner,
          to: destination ?? owner,
          fromName,
          toName,
          amount,
          token,
          fee: (tx?.meta?.fee ?? 0) / LAMPORTS_PER_SOL,
          network: "Solana",
          timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now(),
          signature: "",
          flags: ["Token transfer detected"],
        };
      }

      if (type === "mintTo") {
        return {
          type: "send",
          status: tx?.meta?.err ? "failed" : "success",
          from: owner,
          to: owner,
          fromName: "You",
          toName: "You",
          amount,
          token,
          fee: (tx?.meta?.fee ?? 0) / LAMPORTS_PER_SOL,
          network: "Solana",
          timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now(),
          signature: "",
          flags: ["Mint activity detected"],
        };
      }
    }

    if (instruction.program === "system") {
      const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> };
      if (parsed.type === "transferChecked") {
        continue;
      }
    }
  }

  return null;
}

function nameForWallet(wallet: string, owner: string, contactNameByWallet: Map<string, string>) {
  if (wallet === owner) {
    return "You";
  }

  const contactName = contactNameByWallet.get(wallet);
  return contactName ? `@${contactName}` : shortAddress(wallet);
}

function symbolForMint(mint: string) {
  if (mint === "So11111111111111111111111111111111111111112") return "SOL";
  if (mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") return "USDC";
  if (mint === "Es9vMFrzaCERmJfrF4H2w6RgjR1fQwS2b8s9s7w1qS2") return "USDT";
  if (mint === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN") return "JUP";
  return shortAddress(mint, 4).toUpperCase();
}

function formatAmount(value: number) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: value < 10 ? 2 : 0,
    maximumFractionDigits: 4,
  });
}

function formatInr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function shortAddress(value: string, chars = 4) {
  if (value.length <= chars * 2 + 3) {
    return value;
  }
  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

function statusEmoji(status: TxSummary["status"]) {
  if (status === "success") {
    return "✅";
  }
  if (status === "pending") {
    return "⏳";
  }
  return "❌";
}

function timeAgo(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / (60 * 1000));

  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins} min ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}
