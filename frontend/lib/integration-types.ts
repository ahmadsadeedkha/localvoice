// Mirrors GET /integrations/google and GET /integrations/google/calendars.

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  calendarName: string | null;
  lastError: string | null;
  canEdit: boolean;
};

export type GoogleCalendarOption = {
  id: string;
  name: string;
  primary: boolean;
  timeZone: string | null;
};
