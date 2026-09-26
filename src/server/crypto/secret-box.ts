import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Symmetric encryption for third-party credentials we have to hold ourselves.
 *
 * Clerk holds our users and workspaces, so the only secrets at rest are integration tokens — a
 * Slack bot token is good until revoked, and it has to survive a restart.
 *
 * AES-256-GCM, so the ciphertext is authenticated — a tampered value fails loudly on decrypt
 * rather than silently yielding garbage that we would then send to Slack as a token.
 *
 * Serialised as `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version prefix is what makes
 * key rotation possible later: a `v2` reader can recognise and re-wrap `v1` values.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32;

/** Thrown for every failure mode, so callers never have to distinguish shapes of broken. */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/**
 * Decodes and validates the master key.
 *
 * Read per call rather than cached at module load, so a missing key fails the request that
 * needs it instead of the whole build.
 */
function getKey(rawKey: string | undefined): Buffer {
  if (!rawKey) {
    throw new SecretBoxError(
      'CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.',
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(rawKey, 'base64');
  } catch {
    throw new SecretBoxError('CREDENTIALS_ENCRYPTION_KEY is not valid base64.');
  }

  if (key.length !== KEY_BYTES) {
    throw new SecretBoxError(
      `CREDENTIALS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
    );
  }

  return key;
}

/** Encrypts a UTF-8 string. The output is safe to store in a plain text column. */
export function encryptSecret(plaintext: string, rawKey: string | undefined): string {
  const key = getKey(rawKey);
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Reverses {@link encryptSecret}. Throws if the value was tampered with or the key is wrong. */
export function decryptSecret(serialised: string, rawKey: string | undefined): string {
  const key = getKey(rawKey);

  const parts = serialised.split('.');
  if (parts.length !== 4) {
    throw new SecretBoxError('Malformed encrypted secret: expected 4 dot-separated segments.');
  }

  const [version, ivB64, tagB64, ciphertextB64] = parts;
  if (version !== VERSION) {
    throw new SecretBoxError(`Unsupported encrypted secret version '${version}'.`);
  }

  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_BYTES) {
    throw new SecretBoxError('Malformed encrypted secret: bad IV length.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // GCM authentication failed: wrong key, or the stored value was altered. Deliberately
    // opaque — the caller can do nothing differently, and the detail belongs in neither a log
    // nor an HTTP response.
    throw new SecretBoxError('Unable to decrypt secret: wrong key or corrupted value.');
  }
}

/** True when `value` looks like something {@link decryptSecret} could read. */
export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}

/** Constant-time string compare, for verifying signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
