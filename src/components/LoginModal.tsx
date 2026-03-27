import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Mail, LogIn, X, UserCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export function LoginModal() {
  const { user, signIn, signInManually, isLoading, gsiReady, gsiBlocked } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualError, setManualError] = useState("");
  const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const googleSignInLoading = hasGoogleClientId && !gsiReady;

  // Auto-show manual form if GSI is blocked
  const isManualMode = showManual || gsiBlocked;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) { setManualError("Please enter your name."); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(manualEmail.trim())) { setManualError("Please enter a valid email address."); return; }
    setManualError("");
    signInManually(manualName.trim(), manualEmail.trim());
  };

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
                    Sign in to personalise your experience and keep your data private.
                  </p>
                </div>
              </div>

              {!isManualMode ? (
                <>
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
                      type="button"
                      onClick={() => setShowManual(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                    >
                      Trouble with Google sign-in? Use manual entry →
                    </button>
                    <button
                      onClick={() => setDismissed(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                    >
                      Continue without signing in
                    </button>
                  </div>
                </>
              ) : (
                /* Manual sign-in fallback form */
                <form onSubmit={handleManualSubmit} className="w-full flex flex-col gap-4">
                  {gsiBlocked && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                      <strong>Google sign-in is blocked</strong> in this browser (Brave shields or unregistered origin).<br />
                      Enter your name and email to continue. To fix Google sign-in, add{" "}
                      <code className="font-mono">http://localhost:8080</code> to{" "}
                      <strong>Authorized JavaScript Origins</strong> in Google Cloud Console.
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="manual-name">Your name</Label>
                    <Input
                      id="manual-name"
                      type="text"
                      placeholder="e.g. Alex Johnson"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-email">Email address</Label>
                    <Input
                      id="manual-email"
                      type="email"
                      placeholder="you@example.com"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  {manualError && (
                    <p className="text-xs text-destructive">{manualError}</p>
                  )}
                  <Button type="submit" className="w-full h-11 gap-2 font-semibold rounded-xl">
                    <UserCircle2 className="h-5 w-5" />
                    Sign in
                  </Button>
                  {!gsiBlocked && (
                    <button
                      type="button"
                      onClick={() => setShowManual(false)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                    >
                      ← Back to Google sign-in
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
                  >
                    Continue without signing in
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
