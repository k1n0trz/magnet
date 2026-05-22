import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function getKey() {
  return crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || "magnet-local-development-encryption-key")
    .digest();
}

export function encryptSecret(value: string) {
  if (!value) return "";
  if (isEncryptedSecret(value)) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string) {
  if (!value) return "";
  if (!isEncryptedSecret(value)) return value;
  const [iv, tag, encrypted] = value.split(":");
  const decipher = crypto.createDecipheriv(algorithm, getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value: string) {
  return value.split(":").length === 3;
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return `${value.slice(0, 4)}*********${value.slice(-4)}`;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}
