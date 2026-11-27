export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsPayload = {
  items: NotificationItem[];
  unreadCount: number;
};
