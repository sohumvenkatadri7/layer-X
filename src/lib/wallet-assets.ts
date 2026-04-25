import type { Connection } from "@solana/web3.js";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const API_BASE =
  import.meta.env.VITE_CONTACTS_API_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:8787");
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export type OwnedNft = {
  mint: string;
  tokenAccount: string;
  name?: string;
  symbol?: string;
  image?: string;
};

export type OwnedToken = {
  mint: string;
  tokenAccount: string;
  symbol: string;
  amount: number;
  rawAmount: string;
  decimals: number;
  uiAmountString: string;
};

export type PortfolioAsset = OwnedToken & {
  valueInInr: number | null;
  valueLabel: string;
};

export type WalletPortfolio = {
  solBalance: number;
  solValueInInr: number | null;
  totalValueInInr: number | null;
  holdings: PortfolioAsset[];
  nfts: OwnedNft[];
  usdInr: number | null;
};

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export async function loadWalletAssets(connection: Connection, owner: PublicKey) {
  const [lamports, accounts] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    connection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID,
    }),
  ]);

  const rawHoldings = accounts.value
    .map(({ pubkey, account }) => {
      const parsed = account.data.parsed as {
        info?: {
          mint?: string;
          tokenAmount?: {
            amount?: string;
            decimals?: number;
            uiAmount?: number | null;
            uiAmountString?: string;
          };
        };
      };

      const info = parsed.info;
      const tokenAmount = info?.tokenAmount;

      if (!info?.mint || !tokenAmount?.amount || tokenAmount.decimals === undefined) {
        return null;
      }

      return {
        mint: info.mint,
        tokenAccount: pubkey.toBase58(),
        symbol: symbolForMint(info.mint),
        rawAmount: tokenAmount.amount,
        decimals: tokenAmount.decimals,
        amount: tokenAmount.uiAmount ?? 0,
        uiAmountString: tokenAmount.uiAmountString ?? formatTokenAmount(tokenAmount.amount, tokenAmount.decimals),
      };
    })
    .filter((item): item is OwnedToken => Boolean(item))
    .filter((item) => Number(item.rawAmount) > 0);

  const uniqueHoldings = rawHoldings.filter(
    (item, index, self) => self.findIndex((other) => other.mint === item.mint) === index,
  );

  const nftBase = uniqueHoldings.filter((item) => item.decimals === 0 && item.rawAmount === "1");
  const tokens = uniqueHoldings.filter((item) => !(item.decimals === 0 && item.rawAmount === "1"));

  const nfts = await Promise.all(
    nftBase.map(async (item) => {
      const metadata = await fetchNftMetadata(connection, item.mint);
      return { mint: item.mint, tokenAccount: item.tokenAccount, ...metadata } satisfies OwnedNft;
    }),
  );

  return {
    solLamports: lamports,
    solBalance: lamports / LAMPORTS_PER_SOL,
    tokens: tokens.sort((a, b) => b.amount - a.amount),
    nfts,
  };
}

export async function loadWalletPortfolio(connection: Connection, owner: PublicKey): Promise<WalletPortfolio> {
  const [assets, usdInr] = await Promise.all([loadWalletAssets(connection, owner), loadUsdInrRate()]);

  const holdings = [
    {
      mint: SOL_MINT,
      tokenAccount: owner.toBase58(),
      symbol: "SOL",
      amount: assets.solBalance,
      rawAmount: String(assets.solLamports),
      decimals: 9,
      uiAmountString: formatTokenAmount(String(assets.solLamports), 9),
      valueInInr: null,
      valueLabel: "—",
    },
    ...assets.tokens.map((token) => ({
      ...token,
      valueInInr: null,
      valueLabel: "—",
    })),
  ] satisfies Array<PortfolioAsset>;

  const valuedHoldings = await Promise.all(
    holdings.map(async (holding) => {
      const valueInInr = await fetchHoldingValueInInr(holding, usdInr);
      return {
        ...holding,
        valueInInr,
        valueLabel: formatInr(valueInInr),
      } satisfies PortfolioAsset;
    }),
  );

  const liveHoldings = valuedHoldings.filter((holding) => holding.amount > 0);
  const totalValueInInr = liveHoldings.reduce((sum, holding) => sum + (holding.valueInInr ?? 0), 0);
  const solValueInInr = liveHoldings.find((holding) => holding.symbol === "SOL")?.valueInInr ?? null;

  return {
    solBalance: assets.solBalance,
    solValueInInr,
    totalValueInInr,
    holdings: liveHoldings.sort((a, b) => (b.valueInInr ?? 0) - (a.valueInInr ?? 0)),
    nfts: assets.nfts,
    usdInr,
  };
}

export function truncateAddress(address: string, chars = 4) {
  if (address.length <= chars * 2 + 3) {
    return address;
  }

  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

async function fetchNftMetadata(connection: Connection, mint: string) {
  const mintPublicKey = new PublicKey(mint);
  const metadataPda = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPublicKey.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];

  const accountInfo = await connection.getAccountInfo(metadataPda, "confirmed");
  if (!accountInfo?.data) {
    return {};
  }

  const data = accountInfo.data;
  let offset = 1 + 32 + 32;

  const name = readBorshString(data, offset);
  offset += 4 + new TextEncoder().encode(name).length;

  const symbol = readBorshString(data, offset);
  offset += 4 + new TextEncoder().encode(symbol).length;

  const uri = readBorshString(data, offset);
  if (!uri) {
    return { name: cleanNftText(name), symbol: cleanNftText(symbol) };
  }

  try {
    const response = await fetch(uri);
    const metadata = (await response.json()) as { name?: string; symbol?: string; image?: string };
    return {
      name: cleanNftText(metadata.name || name),
      symbol: cleanNftText(metadata.symbol || symbol),
      image: normalizeNftImageUrl(metadata.image, uri),
    } satisfies Partial<OwnedNft>;
  } catch {
    return {
      name: cleanNftText(name),
      symbol: cleanNftText(symbol),
    };
  }
}

function readBorshString(data: Uint8Array, offset: number) {
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  const length = view.getUint32(0, true);
  const start = offset + 4;
  const end = start + length;
  return new TextDecoder().decode(data.slice(start, end)).replace(/\0/g, "").trim();
}

function cleanNftText(value: string) {
  return value.replace(/\0/g, "").trim();
}

function normalizeNftImageUrl(image: string | undefined, baseUri: string) {
  if (!image) {
    return undefined;
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }

  if (image.startsWith("ipfs://")) {
    return image.replace("ipfs://", "https://ipfs.io/ipfs/");
  }

  if (baseUri.startsWith("http://") || baseUri.startsWith("https://")) {
    try {
      return new URL(image, baseUri).toString();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function loadUsdInrRate() {
  try {
    const response = await fetch(`${API_BASE}/fx/usd-inr`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { rate?: number };
    return typeof data.rate === "number" && Number.isFinite(data.rate) ? data.rate : null;
  } catch {
    return null;
  }
}

async function fetchHoldingValueInInr(holding: OwnedToken, usdInr: number | null) {
  if (holding.amount <= 0) {
    return null;
  }

  if (holding.mint === SOL_MINT) {
    const usdcValue = await quoteTokenToUsdc(holding.rawAmount, holding.mint);
    return usdcValue != null && usdInr != null ? usdcValue * usdInr : null;
  }

  if (holding.mint === USDC_MINT) {
    return usdInr != null ? holding.amount * usdInr : null;
  }

  const usdcValue = await quoteTokenToUsdc(holding.rawAmount, holding.mint);
  return usdcValue != null && usdInr != null ? usdcValue * usdInr : null;
}

async function quoteTokenToUsdc(rawAmount: string, inputMint: string) {
  if (inputMint === USDC_MINT) {
    return Number(rawAmount) / 1_000_000;
  }

  try {
    const response = await fetch(
      `${API_BASE}/jupiter/quote?inputMint=${inputMint}&outputMint=${USDC_MINT}&amount=${rawAmount}&slippageBps=50`,
    );
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { outAmount?: string };
    if (!data.outAmount) {
      return null;
    }

    return Number(data.outAmount) / 1_000_000;
  } catch {
    return null;
  }
}

function symbolForMint(mint: string) {
  if (mint === SOL_MINT) return "SOL";
  if (mint === USDC_MINT) return "USDC";
  if (mint === "Es9vMFrzaCERmJfrF4H2w6RgjR1fQwS2b8s9s7w1qS2") return "USDT";
  if (mint === "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN") return "JUP";
  return truncateAddress(mint, 4).toUpperCase();
}

function formatInr(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTokenAmount(rawAmount: string, decimals: number) {
  const amount = Number(rawAmount) / 10 ** decimals;
  return amount.toLocaleString("en-US", {
    maximumFractionDigits: Math.min(decimals, 6),
  });
}
