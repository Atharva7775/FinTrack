import { getResend } from "./resendClient";

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL || "FinTrack <onboarding@resend.dev>";
}

function welcomeHtml(name: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#F4F4F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F4F2;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E5E0;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="width:44px;height:44px;border-radius:12px;background-color:#EAF3EC;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:44px;text-align:center;">📈</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;">Welcome to FinTrack, ${escapeHtml(name)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#4B5563;">
                  Your account is ready. FinTrack helps you track spending, set savings goals, and stay on budget — all in one place.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #EEEEEA;font-size:14px;color:#374151;">📊 &nbsp;Log transactions and see where your money goes</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #EEEEEA;font-size:14px;color:#374151;">🎯 &nbsp;Set savings goals with monthly contribution targets</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-top:1px solid #EEEEEA;border-bottom:1px solid #EEEEEA;font-size:14px;color:#374151;">💰 &nbsp;Build budgets and get alerted before you overspend</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F0FF;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#7C3AED;">✨ Premium &middot; Scenario Lab</p>
                      <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
                        Planning a big move, a new job, or a major purchase? Scenario Lab projects your cash flow 12 months out and compares it side-by-side against your current baseline — so you can see the impact of a decision before you make it, not after.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#9CA3AF;">
                  You're receiving this because you just signed in to FinTrack for the first time. If this wasn't you, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sends the first-sign-in welcome email. Throws on failure — callers decide how to handle that. */
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const resend = getResend();
  const safeName = name.trim() || to.split("@")[0];
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: "Welcome to FinTrack",
    html: welcomeHtml(safeName),
  });
  if (error) {
    throw new Error(error.message || "Resend send failed");
  }
}
