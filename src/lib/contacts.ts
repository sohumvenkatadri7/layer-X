import { PublicKey } from "@solana/web3.js";

export type Contact = {
  id: string;
  userId: string;
  name: string;
  wallet: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactResolveResult =
  | {
      matchType: "contact";
      contact: Contact;
    }
  | {
      matchType: "username";
      username: string;
      wallet: string;
      userId: string;
    }
  | {
      matchType: "wallet";
      wallet: string;
    }
  | {
      matchType: "missing";
      query: string;
      message: string;
    };

export type ContactListResponse = {
  contacts: Contact[];
};

export type ContactMutationResponse = {
  contact: Contact | null;
};

export type ContactDraft = {
  name: string;
  wallet: string;
};

const API_BASE =
  import.meta.env.VITE_CONTACTS_API_URL ?? (import.meta.env.PROD ? "/api" : "http://localhost:8787");

function buildUrl(path: string) {
  return `${API_BASE}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error || payload?.message || response.statusText || "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export function isValidSolanaAddress(value: string) {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizeContactName(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, " ").toLowerCase();
}

export function displayContactName(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\s+/g, " ");
}

export async function listContacts(userId: string) {
  return request<ContactListResponse>(`/contacts?userId=${encodeURIComponent(userId)}`);
}

export async function createContact(userId: string, draft: ContactDraft) {
  return request<ContactMutationResponse>("/contacts", {
    method: "POST",
    body: JSON.stringify({ userId, ...draft }),
  });
}

export async function updateContact(
  userId: string,
  contactId: string,
  draft: Partial<ContactDraft>,
) {
  return request<ContactMutationResponse>(`/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify({ userId, ...draft }),
  });
}

export async function deleteContact(userId: string, contactId: string) {
  return request<{ ok: true }>(`/contacts/${contactId}?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function resolveRecipient(userId: string, query: string) {
  const response = await fetch(
    buildUrl(
      `/contacts/resolve?userId=${encodeURIComponent(userId)}&query=${encodeURIComponent(query)}`,
    ),
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok && response.status !== 404) {
    const message = payload?.error || payload?.message || response.statusText || "Request failed";
    throw new Error(message);
  }

  return payload as ContactResolveResult;
}
