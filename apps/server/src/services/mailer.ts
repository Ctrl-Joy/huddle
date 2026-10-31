// Outgoing email. SMTP via nodemailer in real deployments; tests inject a MemoryTransport.
// Never logs message bodies, codes or SMTP credentials — except in local dev with no SMTP configured,
// where the code is printed to the console so developers can sign up without a mail server.
import nodemailer from 'nodemailer';

export interface OutgoingMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional Reply-To address. */
  replyTo?: string;
}

export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}

/** Captures mail in memory (tests). */
export class MemoryTransport implements MailTransport {
  sent: OutgoingMail[] = [];
  /** When set, send() rejects with this error (to exercise delivery failures). */
  fail: Error | null = null;
  async send(mail: OutgoingMail): Promise<void> {
    if (this.fail) throw this.fail;
    this.sent.push(mail);
  }
  /** Mail sent to `to`, newest last. */
  to(to: string): OutgoingMail[] {
    return this.sent.filter((m) => m.to.toLowerCase() === to.toLowerCase());
  }
  last(to: string): OutgoingMail | undefined {
    return this.to(to).at(-1);
  }
}

export interface SmtpEnv {
  HUDDLE_SMTP_HOST?: string;
  HUDDLE_SMTP_PORT?: string;
  HUDDLE_SMTP_USER?: string;
  HUDDLE_SMTP_PASS?: string;
}

/** SMTP transport from HUDDLE_SMTP_* (port 465 = implicit TLS, anything else = STARTTLS required). Null when unset. */
export function smtpTransportFromEnv(env: SmtpEnv = process.env): MailTransport | null {
  const host = env.HUDDLE_SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.HUDDLE_SMTP_PORT) || 587;
  const user = env.HUDDLE_SMTP_USER?.trim();
  const pass = env.HUDDLE_SMTP_PASS ?? '';
  const t = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465 && port !== 25,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(mail) {
      // address object: nodemailer must not parse the recipient as an address list
      await t.sendMail({ from: mail.from, to: { name: '', address: mail.to }, subject: mail.subject, text: mail.text, html: mail.html,
        replyTo: mail.replyTo ? { name: '', address: mail.replyTo } : undefined });
    },
  };
}

export interface MailerOptions {
  transport: MailTransport | null;
  from: string;
  /** Print undeliverable mail (including codes) to the console. Only ever true outside production. */
  devLog: boolean;
}

export interface MailContent {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Label for logs, e.g. "verification code". Subjects can contain codes, so only this is ever logged in production. */
  kind: string;
  /** Shown in the dev console when there's no SMTP (e.g. "code 123456"). Never logged otherwise. */
  devNote?: string;
  /** Optional Reply-To address. */
  replyTo?: string;
}

export class Mailer {
  private inflight = new Set<Promise<unknown>>();

  constructor(private opts: MailerOptions) {}

  /** True when mail actually leaves the server. */
  get configured(): boolean {
    return !!this.opts.transport;
  }

  get from(): string {
    return this.opts.from;
  }

  /** Sends one message. Rejects if the transport fails (callers decide whether that matters). */
  send(m: MailContent): Promise<void> {
    const p = this.deliver(m);
    this.inflight.add(p);
    const done = () => { this.inflight.delete(p); };
    p.then(done, done);
    return p;
  }

  /** Fire-and-forget: failures are logged (without the message body). */
  sendInBackground(m: MailContent): void {
    this.send(m).catch((e) => {
      console.error(`[huddle] email delivery failed (${m.kind}): ${(e as Error)?.message ?? e}`);
    });
  }

  /** Resolves once every message handed to send() so far has finished (tests). */
  async settle(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
  }

  private async deliver(m: MailContent): Promise<void> {
    const t = this.opts.transport;
    if (!t) {
      if (this.opts.devLog) {
        console.log(`[huddle] (dev, no SMTP) email to ${m.to}: "${m.subject}"${m.devNote ? ` — ${m.devNote}` : ''}`);
      } else {
        console.error(`[huddle] email not sent (${m.kind}): SMTP is not configured (set HUDDLE_SMTP_HOST)`);
      }
      return;
    }
    await t.send({ from: this.opts.from, to: m.to, subject: m.subject, text: m.text, html: m.html, replyTo: m.replyTo });
  }
}
