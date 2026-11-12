import { base64urlnopad } from "@scure/base";
import { describe, expect, it } from "vitest";

import {
  base64UrlToBuffer,
  bufferToBase64Url,
  isUserCancelled,
  serializeCreationCredential,
  serializeRequestCredential,
  toCreationOptions,
  toRequestOptions,
} from "./webauthn";

// "hello passkey!" in UTF-8
const PAYLOAD = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x70, 0x61, 0x73, 0x73, 0x6b, 0x65, 0x79, 0x21]);

describe("bufferToBase64Url / base64UrlToBuffer", () => {
  it("roundtrips bytes through unpadded base64url", () => {
    const encoded = bufferToBase64Url(PAYLOAD.buffer);
    expect(encoded).toBe(base64urlnopad.encode(PAYLOAD));
    expect(encoded).not.toContain("=");
    expect(Array.from(base64UrlToBuffer(encoded))).toEqual(Array.from(PAYLOAD));
  });

  it("accepts Uint8Array input as well as ArrayBuffer", () => {
    expect(bufferToBase64Url(PAYLOAD)).toBe(bufferToBase64Url(PAYLOAD.buffer));
  });
});

describe("toCreationOptions / toRequestOptions", () => {
  it("decodes challenge, user id and excludeCredentials into buffers", () => {
    const encoded = bufferToBase64Url(PAYLOAD);
    const options = toCreationOptions({
      publicKey: {
        challenge: encoded,
        rp: { name: "test" },
        user: { id: encoded, name: "user", displayName: "User" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        excludeCredentials: [{ type: "public-key", id: encoded }],
      },
    });
    expect(options.publicKey?.challenge).toEqual(PAYLOAD);
    expect(options.publicKey?.user.id).toEqual(PAYLOAD);
    expect(options.publicKey?.excludeCredentials?.[0].id).toEqual(PAYLOAD);
    expect(options.publicKey?.user.displayName).toBe("User");
  });

  it("decodes challenge and allowCredentials for authentication", () => {
    const encoded = bufferToBase64Url(PAYLOAD);
    const options = toRequestOptions({
      publicKey: {
        challenge: encoded,
        rpId: "example.com",
        allowCredentials: [{ type: "public-key", id: encoded }],
      },
    });
    expect(options.publicKey?.challenge).toEqual(PAYLOAD);
    expect(options.publicKey?.rpId).toBe("example.com");
    expect(options.publicKey?.allowCredentials?.[0].id).toEqual(PAYLOAD);
  });
});

describe("credential serializers", () => {
  const credential = {
    id: "test-id",
    rawId: PAYLOAD.buffer,
    type: "public-key",
    getClientExtensionResults: () => ({}),
  } as unknown as PublicKeyCredential;

  it("serializes a registration credential with camelCase wire names", () => {
    const attestation = new Uint8Array([1, 2, 3]);
    const clientData = new Uint8Array([4, 5, 6]);
    const cred = {
      ...credential,
      response: {
        attestationObject: attestation.buffer,
        clientDataJSON: clientData.buffer,
        getTransports: () => ["internal"],
      },
    } as unknown as PublicKeyCredential;
    const serialized = serializeCreationCredential(cred);
    expect(serialized.id).toBe("test-id");
    expect(serialized.rawId).toBe(base64urlnopad.encode(PAYLOAD));
    expect(serialized.response.attestationObject).toBe(base64urlnopad.encode(attestation));
    expect(serialized.response.clientDataJSON).toBe(base64urlnopad.encode(clientData));
    expect(serialized.response.transports).toEqual(["internal"]);
  });

  it("serializes an authentication credential, keeping userHandle optional", () => {
    const authenticatorData = new Uint8Array([7, 8]);
    const signature = new Uint8Array([9]);
    const base = {
      ...credential,
      response: {
        authenticatorData: authenticatorData.buffer,
        clientDataJSON: PAYLOAD.buffer,
        signature: signature.buffer,
      },
    } as unknown as PublicKeyCredential;
    expect(serializeRequestCredential(base).response.userHandle).toBeUndefined();

    const withHandle = {
      ...credential,
      response: {
        authenticatorData: authenticatorData.buffer,
        clientDataJSON: PAYLOAD.buffer,
        signature: signature.buffer,
        userHandle: PAYLOAD.buffer,
      },
    } as unknown as PublicKeyCredential;
    expect(serializeRequestCredential(withHandle).response.userHandle).toBe(base64urlnopad.encode(PAYLOAD));
  });
});

describe("isUserCancelled", () => {
  it("detects NotAllowedError and rejects other errors", () => {
    const cancelErr = new Error("cancelled");
    cancelErr.name = "NotAllowedError";
    expect(isUserCancelled(cancelErr)).toBe(true);
    expect(isUserCancelled(new Error("network"))).toBe(false);
    expect(isUserCancelled("str")).toBe(false);
  });
});
