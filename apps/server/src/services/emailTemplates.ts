// Plain-text + HTML bodies for account emails. Inline styles only (mail clients strip <style>).

export interface Rendered { subject: string; text: string; html: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function layout(publicUrl: string, title: string, bodyHtml: string): string {
  const home = esc(publicUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f4;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px 28px;">
<tr><td style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#0f766e;padding-bottom:20px;">
<a href="${home}" style="color:#0f766e;text-decoration:none;">Huddle</a>
</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#0f172a;">
<h1 style="font-size:20px;margin:0 0 12px;color:#0f172a;">${esc(title)}</h1>
${bodyHtml}
</td></tr>
</table>
<p style="font-size:12px;color:#64748b;margin:16px 0 0;">Sent by <a href="${home}" style="color:#64748b;">Huddle</a>. This is an automated message; replies aren't read.</p>
</td></tr></table>
</body></html>`;
}

function codeBlock(code: string): string {
  return `<div style="margin:20px 0;text-align:center;">
<span style="display:inline-block;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;padding:14px 18px 14px 28px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;color:#0f172a;user-select:all;-webkit-user-select:all;">${esc(code)}</span>
</div>`;
}

const IGNORE = "Didn't request this? You can safely ignore this email — nothing changes without the code.";

export function verifyEmailMail(publicUrl: string, code: string, opts: { change?: boolean } = {}): Rendered {
  const title = opts.change ? 'Confirm your new Huddle email' : 'Verify your Huddle email';
  const intro = opts.change
    ? 'Enter this code in Huddle to confirm this as your new email address:'
    : 'Welcome to Huddle! Enter this code to verify your email address:';
  return {
    subject: `Your Huddle code: ${code}`,
    text: `${title}\n\n${intro}\n\n    ${code}\n\nThe code expires in 10 minutes.\n\n${IGNORE}\n\nHuddle — ${publicUrl}\n`,
    html: layout(publicUrl, title, `<p style="margin:0;">${esc(intro)}</p>${codeBlock(code)}
<p style="margin:0 0 12px;color:#334155;">The code expires in 10 minutes.</p>
<p style="margin:0;color:#64748b;font-size:13px;">${esc(IGNORE)}</p>`),
  };
}

export function resetPasswordMail(publicUrl: string, code: string): Rendered {
  const title = 'Reset your Huddle password';
  const intro = 'Someone (hopefully you) asked to reset the password for your Huddle account. Enter this code to choose a new one:';
  const ignore = "Didn't request this? Ignore this email — your password stays the same.";
  return {
    subject: `Your Huddle code: ${code}`,
    text: `${title}\n\n${intro}\n\n    ${code}\n\nThe code expires in 10 minutes.\n\n${ignore}\n\nHuddle — ${publicUrl}\n`,
    html: layout(publicUrl, title, `<p style="margin:0;">${esc(intro)}</p>${codeBlock(code)}
<p style="margin:0 0 12px;color:#334155;">The code expires in 10 minutes.</p>
<p style="margin:0;color:#64748b;font-size:13px;">${esc(ignore)}</p>`),
  };
}

export function passwordChangedMail(publicUrl: string): Rendered {
  const subject = 'Your Huddle password was changed';
  const forgot = `${publicUrl}/forgot-password`;
  const body = 'The password for your Huddle account was just changed, and every other device was signed out.';
  const warn = "If this wasn't you, reset your password right away:";
  return {
    subject,
    text: `${body}\n\n${warn} ${forgot}\n\nHuddle — ${publicUrl}\n`,
    html: layout(publicUrl, subject, `<p style="margin:0 0 12px;">${esc(body)}</p>
<p style="margin:0;color:#334155;">${esc(warn)} <a href="${esc(forgot)}" style="color:#0f766e;font-weight:600;">Reset password</a></p>`),
  };
}

export function emailChangedMail(publicUrl: string, newEmail: string): Rendered {
  const subject = 'Your Huddle email was changed';
  const body = `The email address on your Huddle account was changed to ${newEmail}. Account emails will go there from now on.`;
  const warn = "If this wasn't you, contact the Huddle team right away.";
  return {
    subject,
    text: `${body}\n\n${warn}\n\nHuddle — ${publicUrl}\n`,
    html: layout(publicUrl, subject, `<p style="margin:0 0 12px;">${esc(body)}</p>
<p style="margin:0;color:#334155;">${esc(warn)}</p>`),
  };
}

export interface FeedbackMailInput {
  id: string;
  category: string;
  message: string;
  replyTo: string | null;
  username: string | null;
  createdAt: string;
}

/** Feedback page submission, sent to the operator's contact address. */
export function feedbackMail(publicUrl: string, f: FeedbackMailInput): Rendered {
  const subject = `Huddle feedback: ${f.category} (#${f.id.slice(-6)})`;
  const meta: [string, string][] = [
    ['Category', f.category],
    ['Reply to', f.replyTo ?? '(none given)'],
    ['Username', f.username ?? '(not included)'],
    ['Received', f.createdAt],
    ['Reference', f.id],
  ];
  const text = `New message from the Huddle Feedback page\n\n${meta.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${f.message}\n\nHuddle — ${publicUrl}\n`;
  const rows = meta.map(([k, v]) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#64748b;white-space:nowrap;">${esc(k)}</td><td style="padding:2px 0;">${esc(v)}</td></tr>`).join('');
  const html = layout(publicUrl, 'New feedback', `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 16px;">${rows}</table>
<div style="white-space:pre-wrap;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">${esc(f.message)}</div>`);
  return { subject, text, html };
}
