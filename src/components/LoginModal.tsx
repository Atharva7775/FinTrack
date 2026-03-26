import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Mail, LogIn, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function LoginModal() {
  const { user, signIn, isLoading, gsiReady } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const googleSignInLoading = hasGoogleClientId && !gsiReady;

  // Show modal only when not yet signed in and not dismissed
  const showModal = !isLoading && !user && !dismissed;

  return (
    <AnimatePresence>
      {showModal && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md"
          />

          {/* Modal card */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl p-8 flex flex-col items-center gap-6">
              {/* Skip / close */}
              <button
                onClick={() => setDismissed(true)}
                className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Continue without signing in"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Logo */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    Welcome to FinTrack
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Sign in with Google to personalise your experience and email monthly statements directly from the app.
                  </p>
                </div>
              </div>

              {/* Benefits */}
              <ul className="w-full space-y-2.5 text-sm">
                {[
                  { icon: "📊", text: "Your personalised financial dashboard" },
                  { icon: "📩", text: "Email monthly statements with one click" },
                  { icon: "🔒", text: "Secure Google sign-in — no password needed" },
                ].map((b) => (
                  <li
                    key={b.text}
                    className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-2.5"
                  >
                    <span className="text-lg">{b.icon}</span>
                    <span className="text-foreground">{b.text}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="w-full flex flex-col gap-2">
                <Button
                  className="w-full h-12 gap-3 text-base font-semibold rounded-xl"
                  onClick={signIn}
                  disabled={googleSignInLoading}
                >
                  <Mail className="h-5 w-5" />
                  {googleSignInLoading ? "Loading Google…" : "Sign in with Google"}
                </Button>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                >
                  Continue without signing in
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
