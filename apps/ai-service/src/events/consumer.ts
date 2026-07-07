export const consumeEvent = async (event: any) => {
    console.log(`[AI Event Consumer] Received event:`, event.event_type);

    if (event.event_type === "issue_comment.created") {
        const text = event.payload.comment_text;
        if (text.includes("@agent")) {
            console.log(`[AI Event Consumer] @agent mentioned! Triggering response pipeline...`);
            // Trigger planner
        }
    }
};
