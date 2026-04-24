import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Layer X  — Crypto, but as simple as texting" },
      {
        name: "description",
        content:
          "Send, swap, and manage Solana crypto using plain English. Built for clarity and confidence.",
      },
      { property: "og:title", content: "CryptoChat — Crypto, as simple as texting" },
      {
        property: "og:description",
        content:
          "Type what you want, see what will happen, approve. A command-driven crypto interface for Solana.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-primary glow-primary-sm" />
          <span className="font-mono text-sm font-medium tracking-tight">layer X</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <Link to="/app" className="text-foreground transition-colors hover:text-primary-glow">
            Launch App →
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left */}
          <div className="animate-enter">
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Crypto, but as simple as texting.
            </h1>
            <p className="mt-6 max-w-md text-base text-muted-foreground sm:text-lg">
              Send, swap, and manage crypto using plain English. No wallet complexity, no jargon —
              just commands.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/app"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-glow glow-primary"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-transparent px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface"
              >
                Watch Demo
              </button>
            </div>

            <p className="mt-12 text-xs text-muted-foreground/70">
              No wallet complexity · Human-readable transactions · Built on Solana
            </p>
          </div>

          {/* Right — chat sim */}
          <div className="animate-enter [animation-delay:80ms]">
            <ChatSim />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-10 sm:grid-cols-3">
          {[
            { title: "Chat-based commands", body: "Type what you want. We parse intent." },
            { title: "Username-based transfers", body: "Send to @prajwal, not 7Yx…abc123." },
            { title: "Safe transaction preview", body: "See every detail before you confirm." },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary glow-primary-sm" />
              <div>
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}

      <section className="mx-auto max-w-6xl px-6 py-24">
        <Link
          to="/app"
          className="group inline-flex items-center gap-2 text-2xl font-medium tracking-tight text-foreground transition-colors hover:text-primary-glow sm:text-3xl"
        >
          Start using
          <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted-foreground/60">
        © {new Date().getFullYear()} layer X · Built on Solana
      </footer>
    </div>
  );
}

function ChatSim() {
  return (
    <div className="relative rounded-2xl bg-surface p-6 sm:p-8 glow-primary-sm">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
      <div className="relative space-y-6 font-mono text-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
          Connected
        </div>
        <div>
          <span className="text-muted-foreground">{">"} </span>
          <span className="text-foreground">Send 1 SOL to @prajwal</span>
        </div>
        <div className="space-y-1 text-foreground">
          <div>
            <span className="text-primary">✓</span> You are sending{" "}
            <span className="font-medium">1 SOL</span>{" "}
            <span className="text-muted-foreground">(~₹8,000)</span>
          </div>
          <div className="text-muted-foreground">to @prajwal</div>
          <div className="text-muted-foreground">wallet 7Yx…abc123</div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <span className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground glow-primary-sm">
            Confirm
          </span>
          <span className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">
            Cancel
          </span>
        </div>
      </div>
    </div>
  );
}
