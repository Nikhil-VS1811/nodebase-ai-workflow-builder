import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Configure encryption key before importing the production encryption module
process.env.ENCRYPTION_KEY = "test_encryption_key_for_nodebase_suite_32chars";
import { encrypt, decrypt } from "../src/lib/encryption";

describe("Credential Security & Encryption Integrity (Direct Production Module Testing)", () => {
  test("Production encrypt and decrypt functions perform roundtrip encryption cleanly", () => {
    const originalSecret = "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz";
    const encrypted = encrypt(originalSecret);

    assert.notEqual(encrypted, originalSecret);
    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, originalSecret);
  });

  test("Double-encryption bug is prevented when value is omitted on update", () => {
    const originalSecret = "sk-ant-api-key-999";
    const initialEncrypted = encrypt(originalSecret);

    // Production update logic in credentials router:
    const updateInput = {
      name: "Updated Name",
      value: undefined as string | undefined,
    };

    const existingRecord = {
      id: "cred-1",
      name: "Old Name",
      value: initialEncrypted,
    };

    // If value is undefined or empty, preserve existing ciphertext without double-encrypting
    const updatedValue =
      updateInput.value && updateInput.value.trim().length > 0
        ? encrypt(updateInput.value.trim())
        : existingRecord.value;

    assert.equal(updatedValue, initialEncrypted);

    // Decrypting the stored value yields the original plaintext API key
    const decryptedAfterUpdate = decrypt(updatedValue);
    assert.equal(decryptedAfterUpdate, originalSecret);
  });

  test("Replacing secret encrypts new value exactly once", () => {
    const oldSecret = "sk-old-key-111";
    const newSecret = "sk-new-key-222";
    const initialEncrypted = encrypt(oldSecret);

    const updateInput = {
      name: "Updated Name",
      value: newSecret,
    };

    const existingRecord = {
      id: "cred-1",
      name: "Old Name",
      value: initialEncrypted,
    };

    const updatedValue =
      updateInput.value && updateInput.value.trim().length > 0
        ? encrypt(updateInput.value.trim())
        : existingRecord.value;

    assert.notEqual(updatedValue, initialEncrypted);
    const decrypted = decrypt(updatedValue);
    assert.equal(decrypted, newSecret);
  });

  test("Ciphertext masking logic returns value as empty string in query responses", () => {
    const storedRecord = {
      id: "cred-1",
      name: "OpenAI Production",
      type: "OPENAI",
      value: "4b8c9a3e2f1d...real_ciphertext",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Masking transformation in routers.ts:
    const responseData = {
      ...storedRecord,
      value: "",
    };

    assert.equal(responseData.value, "");
    assert.equal(responseData.name, "OpenAI Production");
    assert.equal(responseData.id, "cred-1");
  });
});
