import type { ServerCreationOptions, ServerRequestOptions } from "@models/passkey";
import { base64urlnopad } from "@scure/base";

/**
 * WebAuthn wire helpers.
 *
 * The server (webauthn-rs) exchanges base64url-unpadded strings for every
 * binary field, while the browser WebAuthn API speaks ArrayBuffers. These
 * helpers convert between the two shapes:
 *
 * - server options -> `navigator.credentials.create()/get()` input
 * - browser credential -> server JSON body (camelCase field names match the
 *   serde renames of `RegisterPublicKeyCredential`/`PublicKeyCredential`)
 */

export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return base64urlnopad.encode(bytes);
}

export function base64UrlToBuffer(value: string): Uint8Array {
  return base64urlnopad.decode(value);
}

export function toCreationOptions(options: ServerCreationOptions): CredentialCreationOptions {
  const pk = options.publicKey;
  return {
    publicKey: {
      ...pk,
      challenge: base64UrlToBuffer(pk.challenge),
      user: {
        ...pk.user,
        id: base64UrlToBuffer(pk.user.id),
      },
      excludeCredentials: pk.excludeCredentials?.map((credential) => ({
        ...credential,
        id: base64UrlToBuffer(credential.id),
      })),
    },
  };
}

export function toRequestOptions(options: ServerRequestOptions): CredentialRequestOptions {
  const pk = options.publicKey;
  return {
    publicKey: {
      ...pk,
      rpId: pk.rpId,
      challenge: base64UrlToBuffer(pk.challenge),
      allowCredentials: pk.allowCredentials?.map((credential) => ({
        ...credential,
        id: base64UrlToBuffer(credential.id),
      })),
    },
  };
}

export type SerializedCreationCredential = {
  id: string;
  rawId: string;
  type: string;
  extensions: unknown;
  response: {
    attestationObject: string;
    clientDataJSON: string;
    transports?: string[];
  };
};

export type SerializedRequestCredential = {
  id: string;
  rawId: string;
  type: string;
  extensions: unknown;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
};

export function serializeCreationCredential(credential: PublicKeyCredential): SerializedCreationCredential {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    extensions: credential.getClientExtensionResults(),
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      transports: response.getTransports ? response.getTransports() : undefined,
    },
  };
}

export function serializeRequestCredential(credential: PublicKeyCredential): SerializedRequestCredential {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    extensions: credential.getClientExtensionResults(),
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : undefined,
    },
  };
}

export function isUserCancelled(err: unknown): boolean {
  return err instanceof Error && err.name === "NotAllowedError";
}
