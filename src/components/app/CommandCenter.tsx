import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Mic, ArrowUp, ExternalLink, MicOff, Copy, Check } from "lucide-react";
import {
  createContact,
  resolveRecipient,
  isValidSolanaAddress,
  listContacts,
  type Contact,
} from "@/lib/contacts";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { truncateAddress } from "@/lib/wallet-assets";

type ParsedTx =
  | {
      kind: "send";
      amount: number;
      token: string;
      recipientName: string;
      recipientLabel: string;
      recipientWallet: string;
      recipientSource: "contact" | "username" | "wallet";
    }
  | {
      kind: "swap";
      amount: number;
      from: string;
      to: string;
    };

type FlowState =
  | { phase: "idle" }
  | { phase: "review"; tx: ParsedTx }
  | { phase: "broadcasting"; tx: ParsedTx }
  | { phase: "success"; tx: ParsedTx; hash: string }
  | {
      phase: "missing-contact";
      tx: Extract<ParsedTx, { kind: "send" }>;
      walletDraft: string;
      saving: boolean;
      error?: string;
    };

type LogEntry =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "system"; text: string };

const RUPEE_RATES: Record<string, number> = {
  SOL: 8000,
  USDC: 83,
  JUP: 50,
  ETH: 240000,
};

function parseCommand(input: string): ParsedTx | null {
  const send = input.trim().match(/^send\s+([\d.]+)\s+([a-zA-Z]+)\s+to\s+@?([a-zA-Z0-9_.-]+)$/i);
  if (send) {
    return {
      kind: "send",
      amount: parseFloat(send[1]),
      token: send[2].toUpperCase(),
      recipientName: send[3],
      recipientLabel: send[3],
      recipientWallet: "",
      recipientSource: "contact",
    };
  }
  const swap = input.trim().match(/^swap\s+([\d.]+)\s+([a-zA-Z]+)\s+(?:to|for)\s+([a-zA-Z]+)$/i);
  if (swap) {
    return {
      kind: "swap",
      amount: parseFloat(swap[1]),
      from: swap[2].toUpperCase(),
      to: swap[3].toUpperCase(),
    };
  }
  return null;
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function randomHash() {
  const chars = "abcdef0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `0x${s}`;
}

export function CommandCenter() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const userId = publicKey?.toBase58() ?? null;
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [flow, setFlow] = useState<FlowState>({ phase: "idle" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // @ mention autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Speech recognition
  const {
    transcript,
    isListening,
    error: speechError,
    permissionDenied,
    browserSupportsSpeech,
    toggleListening,
    resetTranscript,
    requestMicrophonePermission,
  } = useSpeechRecognition({
    continuous: true,
    language: "en-IN", // Switch to Indian English for better Indian name recognition
    keywords: contacts.map((c) => c.name), // Boost recognition for precise user contacts
    interimResults: true,
    onResult: (text, isFinal) => {
      if (text && text.trim()) {
        // Clean the text - remove extra spaces and normalize
        const cleanedText = text.trim();

        // Only update input with final results to avoid duplicates
        if (isFinal) {
          setInput((prev) => {
            // If previous input already ends with this text, don't add it again
            if (prev.endsWith(cleanedText)) {
              return prev;
            }

            // If text is already contained in previous input, replace with new version
            if (prev.includes(cleanedText) && cleanedText.length > 5) {
              // Find where the text starts and replace it
              const startIndex = prev.indexOf(cleanedText);
              if (startIndex !== -1) {
                return (
                  prev.slice(0, startIndex) +
                  cleanedText +
                  prev.slice(startIndex + cleanedText.length)
                );
              }
            }

            // Append with space if needed
            if (!prev) {
              return cleanedText;
            }

            // Check if we're continuing the same phrase
            const wordsPrev = prev.split(" ");
            const wordsNew = cleanedText.split(" ");
            const overlap = wordsPrev.slice(-3).join(" ");

            if (cleanedText.startsWith(overlap) && overlap.length > 5) {
              // Overlap found, remove overlapping part
              return prev + cleanedText.slice(overlap.length);
            }

            // Otherwise append with space
            return prev + (prev.endsWith(" ") ? "" : " ") + cleanedText;
          });
        }
      }
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log, flow]);

  // Load contacts when user connects wallet
  useEffect(() => {
    if (userId && connected) {
      setLoadingContacts(true);
      listContacts(userId)
        .then((response) => setContacts(response.contacts))
        .catch((err) => console.error("Failed to load contacts:", err))
        .finally(() => setLoadingContacts(false));
    }
  }, [userId, connected]);

  function appendUser(text: string) {
    setLog((l) => [...l, { id: crypto.randomUUID(), type: "user", text }]);
  }
  function appendSystem(text: string) {
    setLog((l) => [...l, { id: crypto.randomUUID(), type: "system", text }]);
  }

  // Filter contacts based on suggestion query
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(suggestionQuery.toLowerCase()),
  );

  // Handle @ mention input detection
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInput(value);

    // Detect @ pattern at end of input
    const match = value.match(/@(\w*)$/);
    if (match) {
      setShowSuggestions(true);
      setSuggestionQuery(match[1]);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  }

  // Handle @ mention selection
  function handleSelectContact(name: string) {
    const newValue = input.replace(/@\w*$/, `@${name} `);
    setInput(newValue);
    setShowSuggestions(false);
    setSuggestionQuery("");
    setSelectedIndex(0);
    // Focus back to input
    inputRef.current?.focus();
  }

  // Handle keyboard navigation in suggestions
  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || filteredContacts.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredContacts.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        if (showSuggestions) {
          e.preventDefault();
          handleSelectContact(filteredContacts[selectedIndex].name);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || flow.phase === "broadcasting") return;
    appendUser(text);
    setInput("");
    const parsed = parseCommand(text);
    if (!parsed) {
      appendSystem(
        "I didn't understand that. Try: 'send 1 SOL to @prajwal' or 'swap 10 USDC to SOL'.",
      );
      return;
    }

    if (parsed.kind === "swap") {
      setFlow({ phase: "review", tx: parsed });
      return;
    }

    if (!connected || !userId) {
      appendSystem("Connect your wallet first so I can resolve contacts.");
      return;
    }

    try {
      const resolved = await resolveRecipient(userId, parsed.recipientName);

      if (resolved.matchType === "contact") {
        setFlow({
          phase: "review",
          tx: {
            ...parsed,
            recipientLabel: `@${resolved.contact.name}`,
            recipientWallet: resolved.contact.wallet,
            recipientSource: "contact",
          },
        });
        return;
      }

      if (resolved.matchType === "username") {
        setFlow({
          phase: "review",
          tx: {
            ...parsed,
            recipientLabel: `@${resolved.username}`,
            recipientWallet: resolved.wallet,
            recipientSource: "username",
          },
        });
        return;
      }

      if (resolved.matchType === "wallet") {
        setFlow({
          phase: "review",
          tx: {
            ...parsed,
            recipientLabel: truncateAddress(resolved.wallet),
            recipientWallet: resolved.wallet,
            recipientSource: "wallet",
          },
        });
        return;
      }

      setFlow({
        phase: "missing-contact",
        tx: parsed,
        walletDraft: "",
        saving: false,
      });
      appendSystem(
        `No contact found for "${parsed.recipientName}". Add a wallet address to continue.`,
      );
    } catch (requestError) {
      appendSystem(
        requestError instanceof Error ? requestError.message : "Could not resolve contact.",
      );
    }
  }

  async function handleConfirm() {
    if (flow.phase !== "review" || !publicKey) return;

    setFlow({ phase: "broadcasting", tx: flow.tx });

    try {
      if (flow.tx.kind === "send") {
        if (flow.tx.token !== "SOL") {
          throw new Error("Only SOL transfers are currently supported directly.");
        }

        const recipientPubkey = new PublicKey(flow.tx.recipientWallet);
        const amountLamports = Math.round(flow.tx.amount * LAMPORTS_PER_SOL);

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: recipientPubkey,
            lamports: amountLamports,
          }),
        );

        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        const signature = await sendTransaction(transaction, connection, { minContextSlot });
        await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature });

        setFlow({ phase: "success", tx: flow.tx, hash: signature });
      } else {
        // Mock swap for now if needed, or implement full swap
        throw new Error("Swaps not implemented yet.");
      }
    } catch (error) {
      appendSystem(`Transaction failed: ${error instanceof Error ? error.message : String(error)}`);
      setFlow({ phase: "idle" });
    }
  }

  function handleCancel() {
    setFlow({ phase: "idle" });
    appendSystem("Cancelled.");
  }

  function handleReset() {
    setFlow({ phase: "idle" });
  }

  async function handleSaveMissingContact() {
    if (flow.phase !== "missing-contact" || !userId) return;

    const wallet = flow.walletDraft.trim();
    if (!isValidSolanaAddress(wallet)) {
      setFlow({ ...flow, error: "Enter a valid Solana wallet address." });
      return;
    }

    setFlow({ ...flow, saving: true, error: undefined });

    try {
      const response = await createContact(userId, {
        name: flow.tx.recipientName,
        wallet,
      });

      const saved = response.contact;
      if (!saved) {
        throw new Error("Contact could not be saved.");
      }

      setFlow({
        phase: "review",
        tx: {
          ...flow.tx,
          recipientLabel: `@${saved.name}`,
          recipientWallet: saved.wallet,
          recipientSource: "contact",
        },
      });
      appendSystem(`Saved @${saved.name}. Continuing to review.`);
    } catch (requestError) {
      setFlow({
        ...flow,
        saving: false,
        error: requestError instanceof Error ? requestError.message : "Failed to save contact.",
      });
    }
  }

  return (
    <div className="flex h-screen flex-col px-6 py-8 sm:px-12">
      {/* Header */}
      <header className="flex items-center justify-between pb-8">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            What do you want to do today?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Try: <span className="font-mono text-foreground/80">send 1 SOL to @prajwal</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          Connected
        </div>
      </header>

      {/* Conversation flow */}
      <div ref={scrollRef} className="flex-1 min-h-0 space-y-8 overflow-y-auto pr-2">
        {log.length === 0 && flow.phase === "idle" && (
          <div className="text-sm text-muted-foreground/60">
            Your commands and confirmations will appear here.
          </div>
        )}

        {log.map((entry) => (
          <div key={entry.id} className="space-y-1">
            {entry.type === "user" ? (
              <div className="font-mono text-sm">
                <span className="text-muted-foreground">{">"} </span>
                <span className="text-foreground">{entry.text}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{entry.text}</div>
            )}
          </div>
        ))}

        {flow.phase === "review" && (
          <ReviewBlock tx={flow.tx} onConfirm={handleConfirm} onCancel={handleCancel} />
        )}
        {flow.phase === "broadcasting" && <BroadcastingBlock />}
        {flow.phase === "success" && (
          <SuccessBlock tx={flow.tx} hash={flow.hash} onDone={handleReset} />
        )}
        {flow.phase === "missing-contact" && (
          <MissingContactBlock
            tx={flow.tx}
            walletDraft={flow.walletDraft}
            saving={flow.saving}
            error={flow.error}
            onWalletDraftChange={(walletDraft) =>
              setFlow({ ...flow, walletDraft, error: undefined })
            }
            onSave={() => void handleSaveMissingContact()}
            onCancel={handleCancel}
          />
        )}
      </div>

      {/* Command bar */}
      <form onSubmit={handleSubmit} className="pt-6">
        <div className="group relative flex items-center rounded-xl bg-surface px-4 py-3 transition-shadow focus-within:glow-primary-sm">
          {/* Speech recognition status indicators */}
          {isListening && (
            <div className="absolute -top-8 left-0 right-0 flex justify-center">
              <div className="rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary animate-pulse">
                🎤 Listening... Speak your command
              </div>
            </div>
          )}
          {speechError && (
            <div className="absolute -top-8 left-0 right-0 flex justify-center">
              <div className="rounded-md bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive flex flex-col items-center gap-1">
                <div className="flex items-center">
                  <span className="mr-1">⚠️</span>
                  <span>{speechError}</span>
                </div>
                {permissionDenied && (
                  <button
                    type="button"
                    onClick={requestMicrophonePermission}
                    className="mt-1 rounded bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/30 transition-colors"
                  >
                    Grant Microphone Permission
                  </button>
                )}
              </div>
            </div>
          )}
          {/* @ mention suggestions dropdown */}
          {showSuggestions && filteredContacts.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-surface border border-border shadow-lg z-20">
              {filteredContacts.map((contact, i) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleSelectContact(contact.name)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                    i === selectedIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-surface/80"
                  }`}
                >
                  <span className="font-mono">@{contact.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {truncateAddress(contact.wallet)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {showSuggestions && filteredContacts.length === 0 && suggestionQuery && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-surface border border-border shadow-lg z-20 px-4 py-3 text-xs text-muted-foreground">
              No contacts found for @{suggestionQuery}
            </div>
          )}
          <span className="mr-3 font-mono text-sm text-muted-foreground">{">"}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command…"
            className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            autoFocus
            disabled={flow.phase === "broadcasting"}
          />
          <button
            type="button"
            aria-label={isListening ? "Stop listening" : "Start voice input"}
            onClick={toggleListening}
            disabled={!browserSupportsSpeech}
            className={`ml-2 flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "text-muted-foreground hover:text-primary"
            } ${!browserSupportsSpeech ? "opacity-50 cursor-not-allowed" : ""}`}
            title={
              !browserSupportsSpeech
                ? "Speech recognition not supported in your browser"
                : isListening
                  ? "Click to stop listening"
                  : "Click to start voice input"
            }
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            type="submit"
            aria-label="Send command"
            disabled={!input.trim() || flow.phase === "broadcasting"}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-all hover:bg-primary-glow disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function txAmountInr(tx: ParsedTx) {
  const symbol = tx.kind === "send" ? tx.token : tx.from;
  const rate = RUPEE_RATES[symbol] ?? 100;
  return inr(tx.amount * rate);
}

function ReviewBlock({
  tx,
  onConfirm,
  onCancel,
}: {
  tx: ParsedTx;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isSend = tx.kind === "send";
  return (
    <div className="animate-enter space-y-5 border-l-2 border-border-subtle pl-5">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {isSend ? "You are about to send" : "You are about to swap"}
        </div>
        <div className="font-mono text-2xl font-medium text-foreground">
          {tx.amount} {isSend ? tx.token : tx.from}
          <span className="ml-2 text-base text-muted-foreground">({txAmountInr(tx)})</span>
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        {isSend ? (
          <>
            <Row label="To" value={tx.recipientLabel} />
            <Row label="Wallet" mono value={truncateAddress(tx.recipientWallet)} />
            <div className="text-xs text-primary">
              ✓ {tx.recipientSource === "contact" ? "Saved contact" : "Resolved recipient"}
            </div>
          </>
        ) : (
          <>
            <Row label="From" value={tx.from} />
            <Row label="To" value={tx.to} />
            <Row label="Estimated rate" mono value={`1 ${tx.from} ≈ 0.012 ${tx.to}`} />
          </>
        )}
        <Row label="Network" value="Solana" />
        <Row label="Cluster" value="Devnet" />
        <Row label="Fee" mono value="0.000005 SOL" />
      </div>

      <div className="space-y-1 text-xs">
        {isSend && <div className="text-warning">⚠ First time interacting with this address</div>}
        {tx.amount >= 5 && <div className="text-warning">⚠ Large amount — please double check</div>}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onConfirm}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-glow active:scale-[0.98] glow-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Confirm Transaction
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function BroadcastingBlock() {
  return (
    <div className="animate-enter flex items-center gap-3 border-l-2 border-primary/40 pl-5 text-sm text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
      Broadcasting transaction…
    </div>
  );
}

function SuccessBlock({ tx, hash, onDone }: { tx: ParsedTx; hash: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copySignature() {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="animate-enter animate-success rounded-xl border border-primary/30 bg-surface/50 p-5">
      <div className="text-sm font-medium text-primary">✓ Sent successfully</div>
      <div className="mt-2 text-sm text-foreground">
        {tx.kind === "send"
          ? `${tx.amount} ${tx.token} sent to ${tx.recipientLabel}`
          : `Swapped ${tx.amount} ${tx.from} for ${tx.to}`}
      </div>
      <div className="mt-3 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        Txn: {hash}…
      </div>
      <div className="mt-4 flex items-center gap-4">
        <a
          href={`https://explorer.solana.com/tx/${hash}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary-glow"
        >
          View on explorer <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={() => void copySignature()}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {copied ? (
            <>
              Copied <Check className="h-3 w-3 text-primary" />
            </>
          ) : (
            <>
              Copy Txn Hash <Copy className="h-3 w-3" />
            </>
          )}
        </button>
        <button
          onClick={onDone}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function MissingContactBlock({
  tx,
  walletDraft,
  saving,
  error,
  onWalletDraftChange,
  onSave,
  onCancel,
}: {
  tx: Extract<ParsedTx, { kind: "send" }>;
  walletDraft: string;
  saving: boolean;
  error?: string;
  onWalletDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="animate-enter space-y-4 border-l-2 border-primary/40 pl-5">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          No contact found for "{tx.recipientName}"
        </div>
        <div className="text-sm text-muted-foreground">
          Enter the wallet address once, save it to contacts, and continue.
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground" htmlFor="missing-wallet">
          Wallet address
        </label>
        <input
          id="missing-wallet"
          value={walletDraft}
          onChange={(event) => onWalletDraftChange(event.target.value)}
          placeholder="7YxQzK9p..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-glow disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {saving ? "Saving..." : "Save & Continue"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-6">
      <span className="w-20 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
