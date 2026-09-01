export const consumeEvent = async (event: any) => {
  if (!event || typeof event !== "object") {
    console.warn("[AI Event Consumer] Invalid or empty event body received.");
    return;
  }

  console.log(`[AI Event Consumer] Received event:`, event.event_type || "unknown");

  if (event.event_type === "issue_comment.created" && event.payload?.comment_text) {
    const text = String(event.payload.comment_text);
    if (text.includes("@agent")) {
      console.log(`[AI Event Consumer] @agent mentioned! Triggering response pipeline...`);
      // Trigger planner
    }
  }
};
