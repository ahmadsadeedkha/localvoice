import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuth2Client } from 'google-auth-library';
import { calendar, type calendar_v3 } from '@googleapis/calendar';
import { GoogleCalendarConnection } from './google-calendar-connection.entity';
import { createState, verifyState } from './oauth-state';
import { decryptSecret, encryptSecret, parseKey } from './token-crypto';

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events',
];

/** Without these the integration can't work, so a partial grant is rejected. */
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events',
];

/** Thrown when the stored refresh token no longer works (user revoked access, or 7-day Testing expiry). */
export class GoogleNotConnectedError extends Error {}

const isInvalidGrant = (e: any) =>
  e?.response?.data?.error === 'invalid_grant' ||
  /invalid_grant/.test(String(e?.message));

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  key: Buffer;
}

@Injectable()
export class GoogleCalendarService {
  private readonly log = new Logger(GoogleCalendarService.name);
  private cfg?: GoogleConfig;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(GoogleCalendarConnection)
    private readonly repo: Repository<GoogleCalendarConnection>,
  ) {}

  /** Lazily validated, so the app still boots when Google isn't configured (CI, local). */
  private google(): GoogleConfig {
    if (this.cfg) return this.cfg;
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');
    const rawKey = this.config.get<string>('GOOGLE_TOKEN_ENC_KEY');
    if (!clientId || !clientSecret || !redirectUri || !rawKey) {
      throw new ServiceUnavailableException(
        'Google Calendar is not configured on this server',
      );
    }
    this.cfg = { clientId, clientSecret, redirectUri, key: parseKey(rawKey) };
    return this.cfg;
  }

  isConfigured(): boolean {
    try {
      this.google();
      return true;
    } catch {
      return false;
    }
  }

  private newClient(): OAuth2Client {
    const { clientId, clientSecret, redirectUri } = this.google();
    return new OAuth2Client({ clientId, clientSecret, redirectUri });
  }

  // ---------- OAuth flow ----------

  buildAuthUrl(tenantId: string, userId: string): string {
    return this.newClient().generateAuthUrl({
      access_type: 'offline', // we need a refresh token: calls happen when nobody is logged in
      prompt: 'consent', // forces Google to return a refresh token even on reconnect
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state: createState(tenantId, userId, this.google().key),
    });
  }

  /** Called from the public callback. Returns the tenant it connected. */
  async handleCallback(code: string, state: string): Promise<string> {
    const { key, clientId } = this.google();
    const parsed = verifyState(state, key);
    if (!parsed) throw new BadRequestException('invalid_state');

    const client = this.newClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Happens if prompt=consent was dropped. Without it we can't act on later calls.
      throw new BadRequestException('no_refresh_token');
    }
    const granted = (tokens.scope ?? '').split(' ');
    if (!REQUIRED_SCOPES.every((s) => granted.includes(s))) {
      // The consent screen lets users untick scopes; we need all of them.
      await client.revokeToken(tokens.refresh_token).catch(() => undefined);
      throw new BadRequestException('missing_scopes');
    }
    if (!tokens.id_token) throw new BadRequestException('no_id_token');

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });
    const email = ticket.getPayload()?.email;
    if (!email) throw new BadRequestException('no_email');

    const existing = await this.repo.findOne({
      where: { tenantId: parsed.tenantId },
    });
    const sameAccount = existing?.googleEmail === email;

    await this.repo.upsert(
      {
        tenantId: parsed.tenantId,
        googleEmail: email,
        refreshTokenEnc: encryptSecret(tokens.refresh_token, key),
        scopes: granted.join(' '),
        // Reconnecting the same account keeps the chosen calendar; a different account must pick again.
        calendarId: sameAccount ? existing.calendarId : null,
        calendarName: sameAccount ? existing.calendarName : null,
        status: 'active',
        lastError: null,
        connectedByUserId: parsed.userId,
      },
      ['tenantId'],
    );
    this.log.log(
      `Tenant ${parsed.tenantId} connected Google Calendar (${email})`,
    );
    return parsed.tenantId;
  }

  // ---------- Dashboard endpoints ----------

  async status(tenantId: string) {
    const c = await this.repo.findOne({ where: { tenantId } });
    return {
      configured: this.isConfigured(),
      connected: !!c && c.status === 'active',
      needsReconnect: c?.status === 'revoked',
      googleEmail: c?.googleEmail ?? null,
      calendarId: c?.calendarId ?? null,
      calendarName: c?.calendarName ?? null,
      lastError: c?.lastError ?? null,
    };
  }

  /** Only calendars we can write events to are offered. */
  async listCalendars(tenantId: string) {
    const api = await this.calendarApi(tenantId);
    const items = await this.call(tenantId, () =>
      api.calendarList.list({ minAccessRole: 'writer', maxResults: 250 }),
    );
    return (items.data.items ?? []).map((c) => ({
      id: c.id!,
      name: c.summaryOverride ?? c.summary ?? c.id!,
      primary: !!c.primary,
      timeZone: c.timeZone ?? null,
    }));
  }

  async selectCalendar(tenantId: string, calendarId: string) {
    // Re-check against Google rather than trusting the id from the browser.
    const match = (await this.listCalendars(tenantId)).find(
      (c) => c.id === calendarId,
    );
    if (!match)
      throw new BadRequestException('Calendar not found or not writable');
    await this.repo.update(
      { tenantId },
      { calendarId: match.id, calendarName: match.name },
    );
    return this.status(tenantId);
  }

  async disconnect(tenantId: string) {
    const c = await this.repo
      .createQueryBuilder('c')
      .addSelect('c.refreshTokenEnc')
      .where('c.tenantId = :tenantId', { tenantId })
      .getOne();
    if (!c) return { disconnected: true };

    // Best effort: revoke at Google so the token is dead even if our DB leaked later.
    try {
      await this.newClient().revokeToken(
        decryptSecret(c.refreshTokenEnc, this.google().key),
      );
    } catch (e) {
      this.log.warn(
        `Google revoke failed for tenant ${tenantId}: ${String(e)}`,
      );
    }
    await this.repo.delete({ tenantId });
    return { disconnected: true };
  }

  // ---------- For availability + sync (steps 3 and 4) ----------

  /** The active connection with a chosen calendar, or null if the tenant isn't using Google. */
  async activeConnection(tenantId: string) {
    const c = await this.repo.findOne({
      where: { tenantId, status: 'active' },
    });
    return c?.calendarId ? c : null;
  }

  /** An authenticated Calendar API client for this tenant. Access tokens refresh automatically. */
  async calendarApi(tenantId: string): Promise<calendar_v3.Calendar> {
    const c = await this.repo
      .createQueryBuilder('c')
      .addSelect('c.refreshTokenEnc')
      .where('c.tenantId = :tenantId AND c.status = :status', {
        tenantId,
        status: 'active',
      })
      .getOne();
    if (!c) throw new NotFoundException('Google Calendar is not connected');

    const auth = this.newClient();
    auth.setCredentials({
      refresh_token: decryptSecret(c.refreshTokenEnc, this.google().key),
    });
    return calendar({ version: 'v3', auth });
  }

  /**
   * Wraps every Google call: an invalid_grant means the business must reconnect,
   * so mark the connection revoked (the dashboard shows "Reconnect").
   */
  async call<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isInvalidGrant(e)) {
        await this.repo.update(
          { tenantId },
          {
            status: 'revoked',
            lastError:
              'Google access was revoked or expired. Reconnect Google Calendar.',
          },
        );
        throw new GoogleNotConnectedError('Google access revoked');
      }
      throw e;
    }
  }
}
