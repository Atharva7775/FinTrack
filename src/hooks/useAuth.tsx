/**
 * Google Identity Services (GSI) auth hook – no backend required.
 * Uses the client-side "Sign in with Google" popup flow.
 *
 * Persists name, email, and picture in localStorage so the session
 * survives a page refresh without requiring re-login.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
}

interface AuthCtx {
  user: GoogleUser | null;
  signIn: () => void;
  signOut: () => void;
  /** Sign in manually with a name and email (fallback for non-Google browsers). */
  signInManually: (name: string, email: string) => void;
  isLoading: boolean;
  /** True when the GSI script has loaded (only relevant if VITE_GOOGLE_CLIENT_ID is set). */
  gsiReady: boolean;
  /** True after google.accounts.id.initialize has run. */
  gsiInitialized: boolean;
  /** True when the GSI prompt could not be shown (e.g. unregistered origin, Brave shields). */
  gsiBlocked: boolean;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  signIn: () => {},
  signOut: () => {},
  signInManually: () => {},
  isLoading: true,
  gsiReady: false,
  gsiInitialized: false,
  gsiBlocked: false,
});

const STORAGE_KEY = "fintrack_google_user";
const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void;
          prompt: (cb?: (n: GsiNotification) => void) => void;
          renderButton: (el: HTMLElement, cfg: object) => void;
          disableAutoSelect: () => void;
          revoke: (email: string, done: () => void) => void;
        };
      };
    };
  }
}

/** Minimal typing for Google One Tap notification object */
interface GsiNotification {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
}

/** Reasons that indicate the browser/origin blocked GSI rather than the user. */
const GSI_BLOCKED_REASONS = new Set([
  "unregistered_origin",
  "browser_not_supported",
  "third_party_cookies_blocked",
  "missing_client_id",
  "invalid_client",
]);

/** Decode a Google JWT credential string (id_token) – no library needed. */
function decodeJwt(token: string): GoogleUser | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return {
      name: decoded.name ?? decoded.email,
      email: decoded.email,
      picture: decoded.picture ?? "",
    };
  } catch {
    return null;
  }
}



export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gsiReady, setGsiReady] = useState(false);
  const [gsiInitialized, setGsiInitialized] = useState(false);
  const [gsiBlocked, setGsiBlocked] = useState(false);
  const pendingSignInRef = useRef(false);

  const notifyPromptResult = useCallback((notification: GsiNotification) => {
    if (notification.isNotDisplayed?.()) {
      const reason = notification.getNotDisplayedReason?.() ?? "unknown";
      if (GSI_BLOCKED_REASONS.has(reason)) {
        setGsiBlocked(true);
        toast.error("Google sign-in is blocked in this browser", {
          description:
            reason === "unregistered_origin"
              ? "Add http://localhost:8080 to Authorized JavaScript Origins in Google Cloud Console, or use the manual sign-in below."
              : "Use the manual sign-in form below, or try a different browser.",
        });
      } else {
        toast.error("Google sign-in could not be shown", {
          description: `Reason: ${reason}. Try another browser or use the manual sign-in below.`,
        });
      }
      return;
    }
    if (notification.isSkippedMoment?.()) {
      const reason = notification.getSkippedReason?.() ?? "";
      if (reason && reason !== "user_cancel") {
        toast.message("Google sign-in skipped", { description: reason });
      }
      return;
    }
    if (notification.isDismissedMoment?.()) {
      const reason = notification.getDismissedReason?.() ?? "";
      if (reason === "credential_returned") return;
      toast.message("Sign-in dismissed", { description: reason || undefined });
    }
  }, []);

  // Restore session from storage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Load Google GSI script
  useEffect(() => {
    if (!CLIENT_ID) {
      setGsiReady(false);
      return;
    }
    if (document.getElementById("gsi-script")) {
      setGsiReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGsiReady(true);
    script.onerror = () => {
      toast.error("Failed to load Google sign-in script");
      setGsiReady(false);
    };
    document.head.appendChild(script);
  }, []);

  // Initialize GSI when script is ready
  useEffect(() => {
    if (!gsiReady || !CLIENT_ID || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response: { credential: string }) => {
        const decoded = decodeJwt(response.credential);
        if (decoded) {
          setUser(decoded);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
        } else {
          toast.error("Could not read Google sign-in response");
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    setGsiInitialized(true);
  }, [gsiReady]);

  // Run queued sign-in after GSI is fully initialized
  useEffect(() => {
    if (!gsiInitialized || !pendingSignInRef.current || !window.google) return;
    pendingSignInRef.current = false;
    window.google.accounts.id.prompt(notifyPromptResult);
  }, [gsiInitialized, notifyPromptResult]);

  const signInManually = useCallback((name: string, email: string) => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName || !trimmedEmail) return;
    const manualUser: GoogleUser = { name: trimmedName, email: trimmedEmail, picture: "" };
    setUser(manualUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manualUser));
    toast.success(`Signed in as ${trimmedName}`);
  }, []);

  const signIn = useCallback(() => {
    if (!CLIENT_ID) {
      const email = window.prompt(
        "No VITE_GOOGLE_CLIENT_ID set.\n\nEnter any email to simulate login (demo mode):",
        ""
      );
      if (email) {
        const demoUser: GoogleUser = {
          name: email.split("@")[0].replace(/[._]/g, " "),
          email,
          picture: "",
        };
        setUser(demoUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demoUser));
      }
      return;
    }
    if (!gsiReady) {
      toast.message("Google sign-in is still loading", {
        description: "Wait a moment and try again.",
      });
      return;
    }
    if (!window.google) {
      toast.error("Google sign-in is unavailable", {
        description: "Refresh the page and try again.",
      });
      return;
    }
    if (!gsiInitialized) {
      pendingSignInRef.current = true;
      toast.message("Preparing Google sign-in…", { description: "Try again in a second if nothing appears." });
      return;
    }
    window.google.accounts.id.prompt(notifyPromptResult);
  }, [gsiReady, gsiInitialized, notifyPromptResult]);

  const signOut = useCallback(() => {
    if (window.google && user) {
      window.google.accounts.id.disableAutoSelect();
      window.google.accounts.id.revoke(user.email, () => {});
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, signIn, signOut, signInManually, isLoading, gsiReady, gsiInitialized, gsiBlocked }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
