const API_BASE = import.meta.env.VITE_CONTACTS_API_URL ?? "http://localhost:8787";

export type LaunchTokenPayload = {
  account: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  initialSupply: string;
  tokenDescription: string;
  tokenLogoURL?: string;
};

export type LaunchTokenResponse = {
  serializedTransaction: string;
  mintAddress: string;
  metadataUri: string;
  estimatedCostSol: number;
};

export async function createLaunchTransaction(payload: LaunchTokenPayload) {
  const response = await fetch(`${API_BASE}/launch-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText || "Could not prepare token launch.";
    throw new Error(message);
  }

  return data as LaunchTokenResponse;
}
