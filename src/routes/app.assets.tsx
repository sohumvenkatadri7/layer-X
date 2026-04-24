import { createFileRoute } from "@tanstack/react-router";
import { WalletAssets } from "@/components/app/WalletAssets";

export const Route = createFileRoute("/app/assets")({
  head: () => ({
    meta: [
      { title: "Assets — CryptoChat" },
      { name: "description", content: "View tokens, NFTs, and wallet balances." },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  return <WalletAssets />;
}
