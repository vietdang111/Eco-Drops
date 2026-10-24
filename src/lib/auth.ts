import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseConnection } from "./db";
import type { ActorContext, SafeUser, UserRole } from "./domain";
import { DomainError } from "./errors";
import { strongPasswordSchema } from "./schemas";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SESSION_BYTES = 32;
export const SESSION_COOKIE_NAME = "ecodrops_session";
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

interface SessionUserRow {
  sessionId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  userId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: UserRole;
}

export interface PasswordHashOptions {
  salt?: Uint8Array;
}

export interface NewSession {
  id: string;
  rawToken: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionIdentity {
  actor: ActorContext;
  user: SafeUser;
  sessionId: string;
  expiresAt: string;
}

export interface SessionCookieDescriptor {
  name: typeof SESSION_COOKIE_NAME;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

function deriveKey(password: string, salt: Uint8Array, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { ...options, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export function assertStrongPassword(password: string): void {
  const result = strongPasswordSchema.safeParse(password);
  if (!result.success) {
    throw new DomainError("INVALID_INPUT", "Password does not meet the strength policy.", {
      issues: result.error.issues.map((issue) => issue.message),
    });
  }
}

export async function hashPassword(password: string, options: PasswordHashOptions = {}): Promise<string> {
  assertStrongPassword(password);
  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(16);
  if (salt.byteLength < 16) throw new RangeError("Password salts must contain at least 16 bytes.");
  const derived = await deriveKey(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    "scrypt",
    "v=1",
    `N=${SCRYPT_N}`,
    `r=${SCRYPT_R}`,
    `p=${SCRYPT_P}`,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v=1") return false;
  const N = Number(parts[2]?.replace("N=", ""));
  const r = Number(parts[3]?.replace("r=", ""));
  const p = Number(parts[4]?.replace("p=", ""));
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;

  try {
    const salt = Buffer.from(parts[5] ?? "", "base64url");
    const expected = Buffer.from(parts[6] ?? "", "base64url");
    if (salt.byteLength < 16 || expected.byteLength !== SCRYPT_KEY_LENGTH) return false;
    const actual = await deriveKey(password, salt, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createSession(now = new Date(), ttlSeconds = DEFAULT_SESSION_TTL_SECONDS): NewSession {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError("Session TTL must be a positive integer number of seconds.");
  }
  const rawToken = randomBytes(SESSION_BYTES).toString("base64url");
  return {
    id: randomUUID(),
    rawToken,
    tokenHash: hashSessionToken(rawToken),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString(),
  };
}

export function persistSession(db: DatabaseConnection, userId: string, session: NewSession): void {
  db.prepare<[string, string, string, string, string]>(
    "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(session.id, userId, session.tokenHash, session.createdAt, session.expiresAt);
}

export function resolveSession(
  db: DatabaseConnection,
  rawToken: string,
  now = new Date(),
): SessionIdentity {
  const tokenHash = hashSessionToken(rawToken);
  const row = db.prepare<[string], SessionUserRow>(
    `SELECT s.id AS sessionId, s.token_hash AS tokenHash, s.expires_at AS expiresAt,
            s.revoked_at AS revokedAt, u.id AS userId, u.org_id AS organizationId,
            o.name AS organizationName, u.email, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN organizations o ON o.id = u.org_id
      WHERE s.token_hash = ?`,
  ).get(tokenHash);

  if (!row || row.revokedAt !== null) {
    throw new DomainError("AUTHENTICATION_REQUIRED", "A valid session is required.");
  }
  if (new Date(row.expiresAt).getTime() <= now.getTime()) {
    throw new DomainError("SESSION_EXPIRED", "The session has expired.");
  }
  const stored = Buffer.from(row.tokenHash, "hex");
  const supplied = Buffer.from(tokenHash, "hex");
  if (stored.byteLength !== supplied.byteLength || !timingSafeEqual(stored, supplied)) {
    throw new DomainError("AUTHENTICATION_REQUIRED", "A valid session is required.");
  }

  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    actor: {
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
    },
    user: {
      id: row.userId,
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      email: row.email,
      role: row.role,
    },
  };
}

export function revokeSession(db: DatabaseConnection, rawToken: string, now = new Date()): boolean {
  const result = db
    .prepare<[string, string]>("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .run(now.toISOString(), hashSessionToken(rawToken));
  return result.changes === 1;
}

export function sessionCookie(session: NewSession, production = process.env.NODE_ENV === "production"): SessionCookieDescriptor {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime()) / 1_000),
  );
  return {
    name: SESSION_COOKIE_NAME,
    value: session.rawToken,
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    path: "/",
    maxAge,
  };
}

export function assertRole(actor: ActorContext, allowedRoles: readonly UserRole[]): void {
  if (!allowedRoles.includes(actor.role)) {
    throw new DomainError("FORBIDDEN", "The current role is not permitted to perform this operation.");
  }
}
