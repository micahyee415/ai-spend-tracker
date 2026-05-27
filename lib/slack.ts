// lib/slack.ts
// Plain English: Posts a one-line failure message to a Slack webhook if
// SLACK_ALERT_WEBHOOK is set. Silently no-ops if no webhook configured.
// Used by the sync orchestrator on hard failures.

export async function alertSyncFailure(message: string): Promise<void> {
  const webhook = process.env.SLACK_ALERT_WEBHOOK;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:warning: AI Spend Dashboard sync failed — ${message}` }),
    });
  } catch (err) {
    console.error("Slack alert post failed", err);
  }
}
