import type { DateTime } from "luxon";

export type Passkey = {
  id: number;
  name: string;
  credential_id: string;
  last_used_at: DateTime | null;
  created_at: DateTime;
};

/** Base64url (unpadded) encoded binary, as produced by the server. */
export type Base64Url = string;

export type ServerCreationOptions = {
  publicKey: {
    challenge: Base64Url;
    timeout?: number;
    rp?: { id?: string; name?: string };
    user: { id: Base64Url; name: string; displayName: string };
    pubKeyCredParams: { type: string; alg: number }[];
    excludeCredentials?: { type: string; id: Base64Url; transports?: string[] }[];
    authenticatorSelection?: Record<string, unknown>;
    attestation?: string;
  };
};

export type ServerRequestOptions = {
  publicKey: {
    challenge: Base64Url;
    timeout?: number;
    rpId?: string;
    allowCredentials?: { type: string; id: Base64Url; transports?: string[] }[];
    userVerification?: string;
  };
};
