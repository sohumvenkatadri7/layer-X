import { createFileRoute } from "@tanstack/react-router";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { AlertTriangle, ExternalLink, Rocket, ShieldAlert, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { createLaunchTransaction } from "@/lib/launchpad";
import { truncateAddress } from "@/lib/wallet-assets";

type LaunchDraft = {
    tokenName: string;
    tokenSymbol: string;
    decimals: string;
    initialSupply: string;
    tokenDescription: string;
    tokenLogoURL: string;
};

type LaunchErrors = Partial<Record<keyof LaunchDraft, string>>;

type LaunchResult = {
    mintAddress: string;
    metadataUri: string;
    signature: string;
    estimatedCostSol: number;
};

const INITIAL_DRAFT: LaunchDraft = {
    tokenName: "",
    tokenSymbol: "",
    decimals: "6",
    initialSupply: "",
    tokenDescription: "",
    tokenLogoURL: "",
};

export const Route = createFileRoute("/app/launch")({
    head: () => ({
        meta: [
            { title: "Launchpad — CryptoChat" },
            {
                name: "description",
                content: "Launch a minimal Solana token with the smallest set of inputs.",
            },
        ],
    }),
    component: LaunchpadPage,
});

function LaunchpadPage() {
    const { connection } = useConnection();
    const { publicKey, connected, sendTransaction } = useWallet();
    const [draft, setDraft] = useState<LaunchDraft>(INITIAL_DRAFT);
    const [errors, setErrors] = useState<LaunchErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [launching, setLaunching] = useState(false);
    const [result, setResult] = useState<LaunchResult | null>(null);

    const preview = useMemo(() => buildPreview(draft), [draft]);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        if (!connected || !publicKey) {
            setSubmitError("Connect your wallet before launching a token.");
            return;
        }

        const validation = validateDraft(draft);
        setErrors(validation);
        setSubmitError(null);

        if (Object.keys(validation).length > 0) {
            return;
        }

        setLaunching(true);

        try {
            const payload = await createLaunchTransaction({
                account: publicKey.toBase58(),
                tokenName: draft.tokenName.trim(),
                tokenSymbol: draft.tokenSymbol.trim().toUpperCase(),
                decimals: Number(draft.decimals),
                initialSupply: draft.initialSupply.trim(),
                tokenDescription: draft.tokenDescription.trim(),
                tokenLogoURL: draft.tokenLogoURL.trim(),
            });

      const tx = Transaction.from(base64ToUint8Array(payload.serializedTransaction));
            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, "confirmed");

            setResult({
                mintAddress: payload.mintAddress,
                metadataUri: payload.metadataUri,
                signature,
                estimatedCostSol: payload.estimatedCostSol,
            });
            toast.success("Token launched on devnet.");
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Token launch failed before confirmation.";
            setSubmitError(message);
            toast.error(message);
        } finally {
            setLaunching(false);
        }
    }

    function update<K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) {
        setDraft((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: undefined }));
    }

    return (
        <div className="px-6 py-8 sm:px-12">
            <header className="pb-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
                    <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                    Devnet launchpad
                </div>
                <h1 className="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">Simple Token Launch</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Minimal pump.fun-style flow: name the token, define supply, attach Metaplex metadata,
                    and sign one devnet transaction.
                </p>
            </header>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
                <section className="rounded-[28px] border border-border-subtle bg-gradient-to-br from-surface/95 via-surface/85 to-background p-6 shadow-sm sm:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Launch form
                            </div>
                            <h2 className="mt-1 text-xl font-medium text-foreground">Create in under 30 seconds</h2>
                        </div>
                        <div className="rounded-full border border-border-subtle bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                            {connected && publicKey ? truncateAddress(publicKey.toBase58()) : "Wallet disconnected"}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-8" aria-busy={launching}>
                        <fieldset className="grid gap-5 md:grid-cols-2">
                            <legend className="sr-only">Token basics</legend>

                            <Field
                                id="tokenName"
                                label="Token name"
                                required
                                hint="Shown in wallets and explorer metadata."
                                error={errors.tokenName}
                            >
                                <input
                                    id="tokenName"
                                    type="text"
                                    value={draft.tokenName}
                                    onChange={(event) => update("tokenName", event.target.value)}
                                    placeholder="Prajwal Coin"
                                    autoComplete="off"
                                    maxLength={32}
                                    className={inputClassName(errors.tokenName)}
                                    aria-invalid={errors.tokenName ? "true" : undefined}
                                    aria-describedby={errors.tokenName ? "tokenName-error" : "tokenName-hint"}
                                />
                            </Field>

                            <Field
                                id="tokenSymbol"
                                label="Symbol"
                                required
                                hint="Short ticker, ideally 3-6 letters."
                                error={errors.tokenSymbol}
                            >
                                <input
                                    id="tokenSymbol"
                                    type="text"
                                    value={draft.tokenSymbol}
                                    onChange={(event) => update("tokenSymbol", event.target.value.toUpperCase())}
                                    placeholder="PRJ"
                                    autoComplete="off"
                                    spellCheck={false}
                                    maxLength={10}
                                    className={inputClassName(errors.tokenSymbol)}
                                    aria-invalid={errors.tokenSymbol ? "true" : undefined}
                                    aria-describedby={errors.tokenSymbol ? "tokenSymbol-error" : "tokenSymbol-hint"}
                                />
                            </Field>

                            <Field
                                id="decimals"
                                label="Decimals"
                                required
                                hint="Keep it small for simple community tokens."
                                error={errors.decimals}
                            >
                                <select
                                    id="decimals"
                                    value={draft.decimals}
                                    onChange={(event) => update("decimals", event.target.value)}
                                    className={inputClassName(errors.decimals)}
                                    aria-invalid={errors.decimals ? "true" : undefined}
                                    aria-describedby={errors.decimals ? "decimals-error" : "decimals-hint"}
                                >
                                    {Array.from({ length: 7 }, (_, index) => (
                                        <option key={index} value={String(index)}>
                                            {index}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field
                                id="initialSupply"
                                label="Initial supply"
                                required
                                hint="Whole-number supply before decimals are applied."
                                error={errors.initialSupply}
                            >
                                <input
                                    id="initialSupply"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={draft.initialSupply}
                                    onChange={(event) => update("initialSupply", event.target.value.replace(/[^\d]/g, ""))}
                                    placeholder="1000000"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className={`${inputClassName(errors.initialSupply)} font-mono tabular-nums`}
                                    aria-invalid={errors.initialSupply ? "true" : undefined}
                                    aria-describedby={errors.initialSupply ? "initialSupply-error" : "initialSupply-hint"}
                                />
                            </Field>
                        </fieldset>

                        <fieldset className="grid gap-5">
                            <legend className="sr-only">Metadata</legend>

                            <Field
                                id="tokenDescription"
                                label="Description"
                                required
                                hint="One clear sentence is enough."
                                error={errors.tokenDescription}
                            >
                                <textarea
                                    id="tokenDescription"
                                    value={draft.tokenDescription}
                                    onChange={(event) => update("tokenDescription", event.target.value)}
                                    placeholder="Community token for early testers of CryptoChat."
                                    rows={4}
                                    maxLength={280}
                                    className={`${inputClassName(errors.tokenDescription)} min-h-28 resize-none py-3`}
                                    aria-invalid={errors.tokenDescription ? "true" : undefined}
                                    aria-describedby={
                                        errors.tokenDescription ? "tokenDescription-error" : "tokenDescription-hint"
                                    }
                                />
                            </Field>

                            <Field
                                id="tokenLogoURL"
                                label="Logo URL"
                                hint="Optional direct image URL ending in png, jpg, jpeg, webp, gif, or svg."
                                error={errors.tokenLogoURL}
                            >
                                <input
                                    id="tokenLogoURL"
                                    type="url"
                                    inputMode="url"
                                    value={draft.tokenLogoURL}
                                    onChange={(event) => update("tokenLogoURL", event.target.value)}
                                    placeholder="https://example.com/token.png"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className={inputClassName(errors.tokenLogoURL)}
                                    aria-invalid={errors.tokenLogoURL ? "true" : undefined}
                                    aria-describedby={errors.tokenLogoURL ? "tokenLogoURL-error" : "tokenLogoURL-hint"}
                                />
                            </Field>
                        </fieldset>

                        {submitError ? (
                            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                                {submitError}
                            </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="submit"
                                disabled={launching || !connected}
                                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-glow disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                {launching ? "Preparing launch..." : "Launch Token"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setDraft(INITIAL_DRAFT);
                                    setErrors({});
                                    setSubmitError(null);
                                }}
                                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-background/70 px-5 text-sm text-foreground transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                Reset
                            </button>
                            {/* <div className="text-xs text-muted-foreground">
                                Requires `PINATA_JWT` and devnet SOL in the connected wallet.
                            </div> */}
                        </div>
                    </form>
                </section>

                <aside className="space-y-6">
                    {/* <section className="rounded-[28px] border border-border-subtle bg-gradient-to-b from-background via-surface/60 to-surface/90 p-6 shadow-sm"> */}
                    <section className="rounded-[28px] border border-border-subtle bg-gradient-to-b from-purple-100/30 via-purple-800/50 to-transparent p-6 shadow-sm">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            Preview
                        </div>
                        <div className="mt-5 flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border-subtle bg-background">
                                {draft.tokenLogoURL.trim() ? (
                                    <img
                                        src={draft.tokenLogoURL.trim()}
                                        alt={draft.tokenName.trim() ? `${draft.tokenName.trim()} logo` : "Token logo preview"}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="text-center">
                                        <div className="text-xs uppercase tracking-wider text-muted-foreground">Logo</div>
                                        <div className="mt-1 font-mono text-sm text-foreground">
                                            {(draft.tokenSymbol.trim() || "TKN").slice(0, 4)}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-lg font-medium text-foreground">
                                    {draft.tokenName.trim() || "Untitled token"}
                                </div>
                                <div className="mt-1 font-mono text-sm uppercase tracking-wide text-muted-foreground">
                                    {draft.tokenSymbol.trim() || "TKN"}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <PreviewStat label="Supply" value={preview.displaySupply} />
                            <PreviewStat label="Decimals" value={draft.decimals || "0"} />
                            <PreviewStat label="Network" value="Solana Devnet" />
                            <PreviewStat label="Est. cost" value={`~${preview.estimatedCostSol.toFixed(2)} SOL`} />
                        </div>

                        <div className="mt-6 rounded-2xl border border-border-subtle bg-background/70 p-4">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">Description</div>
                            <p className="mt-2 text-sm leading-6 text-foreground">
                                {draft.tokenDescription.trim() || "Add a short description so wallets and explorers show context."}
                            </p>
                        </div>
                    </section>

                    {/* <section className="rounded-[28px] border border-border-subtle bg-surface/70 p-6 shadow-sm">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            Trust layer
                        </div>
                        <div className="mt-4 space-y-3">
                            {preview.warnings.map((warning) => (
                                <div
                                    key={warning}
                                    className="flex gap-3 rounded-2xl border border-border-subtle bg-background/70 p-4 text-sm text-foreground"
                                >
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                                    <span>{warning}</span>
                                </div>
                            ))}
                        </div>
                    </section> */}

                    {result ? (
                        <section className="rounded-[28px] border border-primary/30 bg-primary/5 p-6 shadow-sm">
                            <div className="text-xs uppercase tracking-wider text-primary">Launch complete</div>
                            <h3 className="mt-2 text-lg font-medium text-foreground">Token created successfully</h3>
                            <div className="mt-5 space-y-3 text-sm">
                                <ResultRow label="Mint" value={truncateAddress(result.mintAddress, 6)} mono />
                                <ResultRow label="Supply owner" value="You now hold 100% of minted supply" />
                                <ResultRow label="Cost" value={`Estimated ~${result.estimatedCostSol.toFixed(2)} SOL`} />
                                <ResultRow label="Metadata" value="Pinned to IPFS via Pinata" />
                            </div>
                            <div className="mt-5 flex flex-wrap gap-3">
                                <a
                                    href={`https://explorer.solana.com/address/${result.mintAddress}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    View mint <ExternalLink className="h-4 w-4" />
                                </a>
                                <a
                                    href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-background/70 px-4 text-sm text-foreground transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    View transaction <ExternalLink className="h-4 w-4" />
                                </a>
                                <a
                                    href={result.metadataUri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-background/70 px-4 text-sm text-foreground transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                    View metadata <ExternalLink className="h-4 w-4" />
                                </a>
                            </div>
                            <div className="mt-5 rounded-2xl border border-border-subtle bg-background/70 p-4 text-sm text-muted-foreground">
                                Next steps: add liquidity, share the mint address, or wire this token into the
                                command flow so users can send it with natural language.
                            </div>
                        </section>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}

function Field({
    id,
    label,
    hint,
    error,
    required,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="space-y-2">
            <label htmlFor={id} className="block text-sm font-medium text-foreground">
                {label} {required ? <span className="text-primary">*</span> : null}
            </label>
            {children}
            <div
                id={`${id}-${error ? "error" : "hint"}`}
                className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
            >
                {error || hint}
            </div>
        </div>
    );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-border-subtle bg-background/70 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-2 font-mono text-base tabular-nums text-foreground">{value}</div>
        </div>
    );
}

function ResultRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-4">
            <span className="w-24 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className={`${mono ? "font-mono" : ""} text-foreground`}>{value}</span>
        </div>
    );
}

function inputClassName(hasError?: string) {
    return `min-h-11 w-full rounded-xl border bg-background/80 px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${hasError ? "border-destructive/60" : "border-border-subtle"
        }`;
}

function validateDraft(draft: LaunchDraft) {
    const nextErrors: LaunchErrors = {};

    if (!draft.tokenName.trim()) {
        nextErrors.tokenName = "Enter a token name.";
    } else if (draft.tokenName.trim().length > 32) {
        nextErrors.tokenName = "Keep the name within 32 characters.";
    }

    if (!draft.tokenSymbol.trim()) {
        nextErrors.tokenSymbol = "Enter a token symbol.";
    } else if (!/^[A-Z0-9]+$/.test(draft.tokenSymbol.trim().toUpperCase())) {
        nextErrors.tokenSymbol = "Use only letters and numbers in the symbol.";
    } else if (draft.tokenSymbol.trim().length > 10) {
        nextErrors.tokenSymbol = "Keep the symbol within 10 characters.";
    }

    if (!/^[0-6]$/.test(draft.decimals)) {
        nextErrors.decimals = "Choose decimals between 0 and 6.";
    }

    if (!draft.initialSupply.trim()) {
        nextErrors.initialSupply = "Enter the supply to mint.";
    } else if (!/^\d+$/.test(draft.initialSupply.trim())) {
        nextErrors.initialSupply = "Supply must be a whole number.";
    } else if (BigInt(draft.initialSupply.trim()) <= 0n) {
        nextErrors.initialSupply = "Supply must be greater than zero.";
    }

    if (!draft.tokenDescription.trim()) {
        nextErrors.tokenDescription = "Add a short token description.";
    } else if (draft.tokenDescription.trim().length > 280) {
        nextErrors.tokenDescription = "Keep the description within 280 characters.";
    }

    if (
        draft.tokenLogoURL.trim() &&
        !/^https?:\/\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i.test(draft.tokenLogoURL.trim())
    ) {
        nextErrors.tokenLogoURL = "Use a direct image URL ending with a supported file extension.";
    }

    return nextErrors;
}

function buildPreview(draft: LaunchDraft) {
    const normalizedSymbol = draft.tokenSymbol.trim().toUpperCase();
    const warnings = [
        "This token has no liquidity yet, so buyers cannot discover a market price immediately.",
        "Anyone can mint a similar name or ticker. Treat branding as unverified until you build trust.",
        "You will own 100% of the initial supply after launch unless you distribute it later.",
    ];

    if (normalizedSymbol.length > 0 && normalizedSymbol.length < 3) {
        warnings.unshift("Very short symbols are easy to confuse with other tokens.");
    }

    if (!draft.tokenLogoURL.trim()) {
        warnings.push("No logo link provided. Wallets may show a generic placeholder until metadata is refreshed.");
    }

    if (draft.decimals === "0") {
        warnings.push("Zero decimals make the token indivisible, which is usually better for collectibles than currency.");
    }

  return {
    warnings,
    estimatedCostSol: 0.01,
    displaySupply: draft.initialSupply
      ? BigInt(draft.initialSupply).toLocaleString("en-US")
      : "0",
  };
}

function base64ToUint8Array(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
