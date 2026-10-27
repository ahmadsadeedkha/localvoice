// Mirrors the backend response shapes. Dates arrive as ISO strings over JSON.

export type CallOutcome =
  | "booked"
  | "transferred"
  | "voicemail"
  | "abandoned"
  | "info";

export type CallListItem = {
  id: string;
  source: "web_test" | "phone";
  fromNumber: string | null;
  toNumber: string | null;
  status: "in_progress" | "ended";
  outcome: CallOutcome;
  startedAt: string;
  durationMs: number | null;
  sentiment: string | null;
  summary: string | null;
};

export type CallsPage = {
  items: CallListItem[];
  total: number;
  timezone: string;
};

export type CallDetail = CallListItem & {
  endedAt: string | null;
  disconnectionReason: string | null;
  callSuccessful: boolean | null;
  transcript: string | null;
  bookings: {
    id: string;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    status: string;
    customerName: string | null;
    customerPhone: string | null;
  }[];
  messages: {
    id: string;
    kind: "message" | "transfer_request";
    callerName: string | null;
    callerPhone: string | null;
    body: string;
    status: string;
    createdAt: string;
  }[];
};

export type CallDetailResponse = { call: CallDetail; timezone: string };

export type DashboardSummary = {
  timezone: string;
  callsToday: number;
  callsYesterday: number;
  missedToday: number;
  avgDurationMs: number | null;
  bookingsToday: number;
  recentCalls: CallListItem[];
};
