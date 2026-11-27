import { buildNotification, renderEmail } from './notification-templates';

describe('buildNotification', () => {
  it('formats the low-balance message with the balance', () => {
    const n = buildNotification('low-balance', { balance: 3.5 });
    expect(n?.body).toContain('$3.50');
    expect(n?.link).toBe('/billing');
  });

  it('returns null for job types that are not tenant notifications', () => {
    expect(buildNotification('invoice-needs-pricing', {})).toBeNull();
  });

  it('shortens long messages', () => {
    const n = buildNotification('new-message', {
      callerName: 'Sam',
      body: 'x'.repeat(500),
    });
    expect(n?.title).toBe('New message from Sam');
    expect(n?.body.length).toBeLessThanOrEqual(200);
  });
});

describe('renderEmail', () => {
  it('escapes caller-supplied text and builds an absolute link', () => {
    const { html, subject } = renderEmail(
      { title: 'Hi <b>', body: '<script>alert(1)</script>', link: '/messages' },
      'https://app.example.com/',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('https://app.example.com/messages');
    expect(subject).toBe('Hi <b>');
  });
});
