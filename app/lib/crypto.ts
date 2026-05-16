import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (key && key.length >= 32) {
    return Buffer.from(key, 'hex');
  }
  // Dev-mode convenience: derive from NEXTAUTH_SECRET. In production this should
  // not be relied upon — set CREDENTIAL_ENCRYPTION_KEY (64-char hex) explicitly.
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[crypto] CREDENTIAL_ENCRYPTION_KEY not set; deriving from NEXTAUTH_SECRET. ' +
        'Set CREDENTIAL_ENCRYPTION_KEY (64-char hex) for production.'
      );
    }
    return Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  }
  throw new Error(
    'No encryption key available: set CREDENTIAL_ENCRYPTION_KEY (64-char hex) or NEXTAUTH_SECRET'
  );
}

export function encrypt(text: string): string {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  // Plaintext-migration path: legacy rows stored credentials un-encrypted
  // (no colons in the value). Return them as-is so existing data still works.
  if (!encryptedText.includes(':')) return encryptedText;
  // Encrypted format: iv:authTag:ciphertext. If decipher throws (bad key, tampering),
  // propagate the error — callers must handle it. Previously this silently returned
  // the ciphertext, which masked real corruption / key-rotation failures.
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
