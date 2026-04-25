import type { Connection } from "@solana/web3.js";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

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
  amount: number;
  rawAmount: string;
  decimals: number;
  uiAmountString: string;
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
    solBalance: lamports / LAMPORTS_PER_SOL,
    tokens: tokens.sort((a, b) => b.amount - a.amount),
    nfts,
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

function formatTokenAmount(rawAmount: string, decimals: number) {
  const amount = Number(rawAmount) / 10 ** decimals;
  return amount.toLocaleString("en-US", {
    maximumFractionDigits: Math.min(decimals, 6),
  });
}
