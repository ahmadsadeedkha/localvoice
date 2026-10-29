// Mirrors the backend response shapes. Dates arrive as ISO strings over JSON.
import type { AppointmentItem } from "@/lib/business-types";
import type { CallListItem } from "@/lib/types";

export type CustomerListItem = {
  phone: string;
  name: string | null;
  callCount: number;
  bookingCount: number;
  lastContactAt: string;
  nextAppointmentAt: string | null;
};

export type CustomersResponse = {
  timezone: string;
  total: number;
  items: CustomerListItem[];
};

export type CustomerMessage = {
  id: string;
  callId: string | null;
  kind: "message" | "transfer_request";
  callerName: string | null;
  callerPhone: string | null;
  body: string;
  status: string;
  createdAt: string;
};

export type CustomerDetail = {
  timezone: string;
  phone: string;
  name: string | null;
  /** Total calls; `calls` holds only the most recent ones. */
  callCount: number;
  nextAppointmentAt: string | null;
  calls: CallListItem[];
  bookings: AppointmentItem[];
  messages: CustomerMessage[];
};
