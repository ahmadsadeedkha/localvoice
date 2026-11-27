export type NotificationContent = {
  title: string;
  body: string;
  link: string | null;
};

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    n,
  );
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const month = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** Returns null for job types that are not tenant notifications. */
export function buildNotification(
  type: string,
  d: Record<string, any>,
): NotificationContent | null {
  switch (type) {
    case 'low-balance':
      return {
        title: 'Your balance is running low',
        body: `${
          typeof d.balance === 'number'
            ? `Your balance is ${usd(d.balance)}. `
            : ''
        }Calls will pause when it runs out. Add funds to keep your phone agent running.`,
        link: '/billing',
      };
    case 'balance-exhausted':
      return {
        title: 'Your balance has run out',
        body: 'Your phone agent is paused until you add funds.',
        link: '/billing',
      };
    case 'new-message': {
      const who = str(d.callerName);
      const phone = str(d.callerPhone);
      return {
        title: who ? `New message from ${who}` : 'New message from a caller',
        body: clip(`${phone ? `${phone}: ` : ''}${str(d.body)}`, 200),
        link: '/messages',
      };
    }
    case 'invoice-issued':
      return {
        title: `Your invoice for ${month(d.periodStart)} is ready`,
        body: `${
          typeof d.amount === 'number' ? `Amount due: ${usd(d.amount)}. ` : ''
        }Due ${day(d.dueAt)}.`,
        link: '/billing',
      };
    case 'invoice-reminder':
      return {
        title: 'Invoice payment due soon',
        body: `Your ${month(d.periodStart)} invoice${
          typeof d.amount === 'number' ? ` (${usd(d.amount)})` : ''
        } is due ${day(d.dueAt)}. Pay it to avoid your phone agent being paused.`,
        link: '/billing',
      };
    case 'invoice-overdue-blocked':
      return {
        title: 'Your phone agent is paused',
        body: 'An invoice is overdue, so calls are paused. Pay the invoice to resume.',
        link: '/billing',
      };
    default:
      return null;
  }
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderEmail(c: NotificationContent, appUrl: string) {
  const base = appUrl.replace(/\/+$/, '');
  const url = c.link ? `${base}${c.link}` : base;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:16px">
<h2 style="margin:0 0 12px">${esc(c.title)}</h2>
<p style="margin:0 0 16px;line-height:1.5">${esc(c.body)}</p>
<p><a href="${esc(url)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open LocalVoice AI</a></p>
</div>`;
  return { subject: c.title.replace(/[\r\n]+/g, ' '), html };
}
