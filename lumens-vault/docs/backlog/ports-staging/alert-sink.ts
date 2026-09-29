// Port: where this application's own alerts go (admin actions, guard trips, ingestion trouble).
// Sorokeep's TTL alerts are NOT sent through here. They arrive via the webhook adapter.

export type AlertSeverity = "info" | "warning" | "critical";

export interface SystemAlert {
  kind: "admin_action" | "price_guard" | "ingestion";
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Source event id when the alert comes from a contract event (idempotency). */
  eventId?: string;
  /** ISO-8601. */
  occurredAt: string;
}

export interface IAlertSink {
  notify(alert: SystemAlert): Promise<void>;
}
