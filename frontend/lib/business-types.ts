// Mirrors the backend response shapes. Dates arrive as ISO strings over JSON.

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export type AppointmentItem = {
  id: string;
  callId: string | null;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  serviceName: string;
  resourceName: string;
};

export type AppointmentsResponse = {
  timezone: string;
  counts: { upcoming: number; past: number };
  items: AppointmentItem[];
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  active: boolean;
};

export type HourInterval = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
};

export type ServicesResponse = {
  timezone: string;
  /** True for owners and admins; the backend enforces this on every write. */
  canEdit: boolean;
  services: Service[];
  hours: HourInterval[];
};
