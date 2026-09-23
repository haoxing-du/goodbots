import type { EmailConfig } from "@auth/core/providers/email";

/**
 * Passwordless email sign-in: sends a one-time link via Resend.
 * Without AUTH_RESEND_KEY (local dev) the link is printed to the Convex logs instead.
 */
export function MagicLink(): EmailConfig {
  return {
    id: "email",
    type: "email",
    name: "Email",
    from: process.env.AUTH_EMAIL_FROM ?? "GoodBots <onboarding@resend.dev>",
    maxAge: 60 * 60, // 1 hour
    options: {},
    async sendVerificationRequest({ identifier: to, url, provider }) {
      const apiKey = process.env.AUTH_RESEND_KEY;
      if (!apiKey) {
        console.log(`[magic link] Sign-in link for ${to}: ${url}`);
        return;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: provider.from,
          to,
          subject: "Your GoodBots sign-in link",
          text: `Sign in to GoodBots:\n\n${url}\n\nThis link expires in 1 hour. If you didn't ask for it, ignore this email.`,
          html: emailHtml(url),
        }),
      });
      if (!res.ok) throw new Error("Resend error: " + (await res.text()));
    },
  };
}

function emailHtml(url: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f4ef;padding:40px 16px;font-family:Helvetica,Arial,sans-serif;color:#171715">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e2da;border-radius:8px">
<tr><td style="padding:32px">
<div style="font-family:Georgia,serif;font-size:24px;margin-bottom:20px">GoodBots<span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1px;vertical-align:top;margin-left:4px;line-height:1"><span style="color:#df6862">&#9733;</span><span style="color:#cb7f00">&#9733;</span><span style="color:#3eab5e">&#9733;</span><span style="color:#009ee0">&#9733;</span><span style="color:#a878db">&#9733;</span></span></div>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">Click below to sign in. The link expires in 1 hour.</p>
<a href="${url}" style="display:inline-block;background:#171715;color:#fff;text-decoration:none;padding:11px 18px;border-radius:4px;font-size:14px;font-weight:500">Sign in to GoodBots</a>
<p style="font-size:13px;line-height:1.5;color:#8a877d;margin:24px 0 0">If you didn't ask for this, you can ignore this email.</p>
</td></tr></table></body></html>`;
}
