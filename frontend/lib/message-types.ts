// Mirrors the backend response shapes. Dates arrive as ISO strings over JSON.

export type MessageStatus = "new" | "read" | "handled";

export type MessageItem = {
  id: string;
  callId: string | null;
  kind: "message" | "transfer_request";
  callerName: string | null;
  callerPhone: string | null;
  body: string;
  status: MessageStatus;
  createdAt: string;
};

export type MessagesResponse = {
  timezone: string;
  view: "open" | "handled";
  /** open = new + read; new is the subset nobody has looked at yet. */
  counts: { open: number; new: number; handled: number };
  total: number;
  items: MessageItem[];
};
