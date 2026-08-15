import type { NextFunction, Request, Response } from "express";

interface GoogleTokenInfo {
  aud?: string;
  exp?: string;
  email?: string;
  email_verified?: string | boolean;
  sub?: string;
  name?: string;
  picture?: string;
}

const DEV_DEMO_TOKEN = "demo-google-id-token";

export interface AuthenticatedRequest extends Request {
  authUser?: {
    email: string;
    sub: string;
    name?: string;
    picture?: string;
  };
}

function expectedAudience() {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
}

function extractBearerToken(req: Request) {
  const authHeader = req.header("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

function extractEmailFromRequest(req: Request): string | null {
  const headerEmail = req.header("x-dev-user-email");
  if (headerEmail && headerEmail.includes("@")) return headerEmail.trim().toLowerCase();

  const body = req.body as Record<string, unknown> | undefined;
  const bodyEmail = typeof body?.user_email === "string" ? body.user_email : null;
  if (bodyEmail && bodyEmail.includes("@")) return bodyEmail.trim().toLowerCase();

  const query = req.query as Record<string, unknown>;
  const queryEmail = typeof query?.user_email === "string" ? query.user_email : null;
  if (queryEmail && queryEmail.includes("@")) return queryEmail.trim().toLowerCase();

  return null;
}

async function verifyGoogleIdToken(idToken: string) {
  const audience = expectedAudience();
  if (!audience) {
    throw new Error("Server misconfigured: missing GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_ID");
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    return null;
  }

  const tokenInfo = (await response.json()) as GoogleTokenInfo;

  if (!tokenInfo.aud || tokenInfo.aud !== audience) return null;
  if (!tokenInfo.email) return null;

  const isEmailVerified =
    tokenInfo.email_verified === true || tokenInfo.email_verified === "true";
  if (!isEmailVerified) return null;

  if (!tokenInfo.exp || Number(tokenInfo.exp) * 1000 <= Date.now()) return null;
  if (!tokenInfo.sub) return null;

  return {
    email: tokenInfo.email,
    sub: tokenInfo.sub,
    name: tokenInfo.name,
    picture: tokenInfo.picture,
  };
}

export async function requireGoogleAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const idToken = extractBearerToken(req);
    if (!idToken) {
      return res.status(401).json({
        error: "Missing Authorization bearer token",
      });
    }

    // Development bridge for mobile demo auth flows. This allows end-to-end
    // transaction sync by email without a real Google OAuth flow on mobile yet.
    if (process.env.NODE_ENV !== "production" && idToken === DEV_DEMO_TOKEN) {
      const email = extractEmailFromRequest(req);
      if (!email) {
        return res.status(401).json({
          error: "Missing demo user email for development auth",
        });
      }

      (req as AuthenticatedRequest).authUser = {
        email,
        sub: `demo:${email}`,
        name: email.split("@")[0],
      };
      return next();
    }

    const authUser = await verifyGoogleIdToken(idToken);
    if (!authUser) {
      return res.status(401).json({
        error: "Invalid or expired Google ID token",
      });
    }

    (req as AuthenticatedRequest).authUser = authUser;
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown auth error";
    return res.status(500).json({ error: message });
  }
}
