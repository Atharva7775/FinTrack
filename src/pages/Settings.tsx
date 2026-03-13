import { motion } from "framer-motion";
import { Settings as SettingsIcon } from "lucide-react";
import { CursorTooltip } from "@/components/CursorTooltip";

export default function SettingsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <CursorTooltip content="Change account details, notifications, and export your data. Requires sign-in (coming soon).">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your account and preferences</p>
        </div>
      </CursorTooltip>

      <CursorTooltip content="Settings options will appear here once login and account features are added.">
        <div className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px]">
          <div className="p-4 rounded-2xl bg-muted mb-4">
            <SettingsIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-foreground text-lg mb-2">Coming Soon</h3>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            Account settings, notification preferences, and data export will be available once authentication is enabled.
          </p>
        </div>
      </CursorTooltip>
    </motion.div>
  );
}
