import { DatabaseStore, saveStore } from "../db";
import { UploadPreview, StateChangePreview, InAppNotification } from "../types";
import { getSupabaseClient } from "../supabase";

export interface NotificationPayload {
  to: string;
  subject: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface Notifier {
  name: string;
  sendUploadSummary(payload: {
    summary: {
      new_pos: number;
      total_amount: number;
      total_units: number;
      top_facilities: Array<{ name: string; qty: number }>;
      earliest_expiry: string;
    };
    recipients: string[];
  }, store?: DatabaseStore): Promise<void>;
  sendStateChangeAlert(payload: {
    po_number: string;
    old_state: string;
    new_state: string;
    recipients: string[];
  }, store?: DatabaseStore): Promise<void>;
}

/**
 * Real Email Notifier using Resend or mock fallback
 */
export class EmailNotifier implements Notifier {
  name = "Email (Resend)";

  async sendUploadSummary(payload: {
    summary: {
      new_pos: number;
      total_amount: number;
      total_units: number;
      top_facilities: Array<{ name: string; qty: number }>;
      earliest_expiry: string;
    };
    recipients: string[];
  }): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const body = `
New POs Ingested: ${payload.summary.new_pos}
Total Units: ${payload.summary.total_units.toLocaleString("en-IN")}
Total Value: ₹${payload.summary.total_amount.toLocaleString("en-IN")}
Earliest Expiry: ${payload.summary.earliest_expiry}
Top Facilities: ${payload.summary.top_facilities.map((f) => `${f.name} (${f.qty})`).join(", ")}
View Dashboard: /pos
    `.trim();

    if (apiKey && apiKey.startsWith("re_") && apiKey !== "re_123456789") {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.NOTIFICATION_FROM_EMAIL || "alerts@aksharveda.com",
            to: payload.recipients,
            subject: `[Blinkit PO Ingested] ${payload.summary.new_pos} New Purchase Orders`,
            text: body,
          }),
        });
        console.log(`[EmailNotifier] Sent email to ${payload.recipients.join(", ")}`);
      } catch (err) {
        console.error("[EmailNotifier] Resend API error:", err);
      }
    } else {
      console.log(`[EmailNotifier:Mock] Dispatched email to: ${payload.recipients.join(", ")}\n${body}`);
    }
  }

  async sendStateChangeAlert(payload: {
    po_number: string;
    old_state: string;
    new_state: string;
    recipients: string[];
  }): Promise<void> {
    console.log(
      `[EmailNotifier] Alert: PO #${payload.po_number} state changed from "${payload.old_state}" -> "${payload.new_state}" to ${payload.recipients.join(", ")}`
    );
  }
}

/**
 * WhatsApp Notifier Stub - Logs payload with formatting ready for Meta Cloud API
 */
export class WhatsAppNotifier implements Notifier {
  name = "WhatsApp Cloud API (Stub)";

  async sendUploadSummary(payload: {
    summary: {
      new_pos: number;
      total_amount: number;
      total_units: number;
      top_facilities: Array<{ name: string; qty: number }>;
      earliest_expiry: string;
    };
    recipients: string[];
  }): Promise<void> {
    const templatePayload = {
      messaging_product: "whatsapp",
      template: {
        name: "po_batch_ingested",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(payload.summary.new_pos) },
              { type: "text", text: String(payload.summary.total_units) },
              { type: "text", text: `₹${payload.summary.total_amount.toLocaleString("en-IN")}` },
              { type: "text", text: payload.summary.earliest_expiry },
            ],
          },
        ],
      },
    };

    console.log(
      `[WhatsAppNotifier:Stub] Logging WhatsApp Cloud API Template Payload for [${payload.recipients.join(", ")}]:\n`,
      JSON.stringify(templatePayload, null, 2)
    );
  }

  async sendStateChangeAlert(payload: {
    po_number: string;
    old_state: string;
    new_state: string;
    recipients: string[];
  }): Promise<void> {
    console.log(
      `[WhatsAppNotifier:Stub] Alert: PO #${payload.po_number} transition: "${payload.old_state}" -> "${payload.new_state}" for [${payload.recipients.join(", ")}]`
    );
  }
}

/**
 * In-App Notifier - Inserts records into in_app_notifications (Supabase and JSON store)
 */
export class InAppNotifier implements Notifier {
  name = "In-App Notification";

  async sendUploadSummary(payload: {
    summary: {
      new_pos: number;
      total_amount: number;
      total_units: number;
      top_facilities: Array<{ name: string; qty: number }>;
      earliest_expiry: string;
    };
    recipients: string[];
  }, store?: DatabaseStore): Promise<void> {
    const notifItem: InAppNotification = {
      id: crypto.randomUUID(),
      title: `${payload.summary.new_pos} New Blinkit POs Ingested`,
      message: `Total units: ${payload.summary.total_units.toLocaleString("en-IN")} | Value: ₹${payload.summary.total_amount.toLocaleString("en-IN")} | Earliest Expiry: ${payload.summary.earliest_expiry}`,
      type: "info",
      metadata: payload.summary,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from("in_app_notifications").insert(notifItem);
    }
    if (store) {
      store.in_app_notifications.unshift(notifItem);
      saveStore(store);
    }
  }

  async sendStateChangeAlert(payload: {
    po_number: string;
    old_state: string;
    new_state: string;
    recipients: string[];
  }, store?: DatabaseStore): Promise<void> {
    const notifItem: InAppNotification = {
      id: crypto.randomUUID(),
      title: `PO State Changed: #${payload.po_number}`,
      message: `Status moved from "${payload.old_state}" to "${payload.new_state}".`,
      type: "warning",
      metadata: payload,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from("in_app_notifications").insert(notifItem);
    }
    if (store) {
      store.in_app_notifications.unshift(notifItem);
      saveStore(store);
    }
  }
}

/**
 * Central Notification Dispatcher
 */
export class NotificationDispatcher {
  private notifiers: Notifier[] = [
    new EmailNotifier(),
    new WhatsAppNotifier(),
    new InAppNotifier(),
  ];

  async notifyUploadSuccess(
    preview: UploadPreview,
    store: DatabaseStore,
    newPOItems?: Array<{ po_number: string; facility_raw: string; expiry_date: string; total_amount: number; total_qty: number }>
  ): Promise<void> {
    if (preview.pos_new === 0) {
      console.log("[NotificationDispatcher] 0 new POs - notification suppressed.");
      return;
    }

    // Calculate metrics strictly for the NEW POs (Fixes Check 30 & Item 6)
    const facilityCounts: Record<string, number> = {};
    let earliestExpiry = "9999-12-31";
    let totalAmount = 0;
    let totalUnits = 0;

    const targetList = newPOItems && newPOItems.length > 0
      ? newPOItems
      : store.po_header.slice(0, preview.pos_new);

    targetList.forEach((h) => {
      totalAmount += Number(h.total_amount);
      totalUnits += Number(h.total_qty);
      facilityCounts[h.facility_raw] = (facilityCounts[h.facility_raw] || 0) + Number(h.total_qty);
      if (h.expiry_date && h.expiry_date < earliestExpiry) {
        earliestExpiry = h.expiry_date;
      }
    });

    const topFacilities = Object.entries(facilityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const activeRecipients = store.notification_recipients.filter((r) => r.is_active);
    const emailRecipients = activeRecipients
      .filter((r) => r.channel_prefs.email && r.email)
      .map((r) => r.email!);
    const whatsappRecipients = activeRecipients
      .filter((r) => r.channel_prefs.whatsapp && r.phone)
      .map((r) => r.phone!);

    const summaryData = {
      new_pos: preview.pos_new,
      total_amount: Math.round(totalAmount),
      total_units: totalUnits,
      top_facilities: topFacilities,
      earliest_expiry: earliestExpiry === "9999-12-31" ? "N/A" : earliestExpiry,
    };

    // 1. In-App
    const inApp = this.notifiers.find((n) => n instanceof InAppNotifier) as InAppNotifier;
    if (inApp) {
      await inApp.sendUploadSummary({ summary: summaryData, recipients: [] }, store);
    }

    // 2. Email
    const emailNotifier = this.notifiers.find((n) => n instanceof EmailNotifier);
    if (emailNotifier && emailRecipients.length > 0) {
      await emailNotifier.sendUploadSummary({ summary: summaryData, recipients: emailRecipients });
    }

    // 3. WhatsApp Stub
    const waNotifier = this.notifiers.find((n) => n instanceof WhatsAppNotifier);
    if (waNotifier && whatsappRecipients.length > 0) {
      await waNotifier.sendUploadSummary({ summary: summaryData, recipients: whatsappRecipients });
    }
  }

  /**
   * Fires state change alerts for transitioned POs (Fixes Check 32 & Item 6)
   */
  async notifyStateChanges(stateChanges: StateChangePreview[], store: DatabaseStore): Promise<void> {
    if (!stateChanges || stateChanges.length === 0) return;

    const activeRecipients = store.notification_recipients.filter((r) => r.is_active);
    const emailRecipients = activeRecipients
      .filter((r) => r.channel_prefs.email && r.email)
      .map((r) => r.email!);
    const whatsappRecipients = activeRecipients
      .filter((r) => r.channel_prefs.whatsapp && r.phone)
      .map((r) => r.phone!);

    for (const change of stateChanges) {
      for (const notifier of this.notifiers) {
        const recipients = notifier instanceof EmailNotifier
          ? emailRecipients
          : notifier instanceof WhatsAppNotifier
          ? whatsappRecipients
          : [];
        await notifier.sendStateChangeAlert(
          {
            po_number: change.po_number,
            old_state: change.old_state,
            new_state: change.new_state,
            recipients,
          },
          store
        );
      }
    }
  }
}

let dispatcherInstance: NotificationDispatcher | null = null;
export function getNotificationDispatcher(): NotificationDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new NotificationDispatcher();
  }
  return dispatcherInstance;
}
