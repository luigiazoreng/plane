import { useEffect, useRef } from "react";

export type THelpdeskSSEEvent = {
  type: "request.created" | "request.updated" | "comment.created";
  request_id: string;
};

export function useHelpdeskSSE(workspaceSlug: string, onEvent: (event: THelpdeskSSEEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!workspaceSlug) return;

    let abortController: AbortController | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000;
    let stopped = false;

    const connect = async () => {
      abortController = new AbortController();
      const signal = abortController.signal;

      try {
        // Relative URL → goes through Vite proxy (same-origin, cookies work)
        const response = await fetch(`/api/workspaces/${workspaceSlug}/helpdesk/events/`, {
          credentials: "include",
          headers: { Accept: "text/event-stream" },
          signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE: HTTP ${response.status}`);
        }

        retryDelay = 2000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-await-in-loop
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: THelpdeskSSEEvent = JSON.parse(line.slice(6));
                onEventRef.current(event);
              } catch {
                // malformed — ignore
              }
            }
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.warn("[SSE] error, retrying in", retryDelay, "ms:", err);
      }

      if (!stopped) {
        retryTimeout = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000);
          connect();
        }, retryDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }
        abortController?.abort();
        retryDelay = 2000;
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (retryTimeout) clearTimeout(retryTimeout);
      abortController?.abort();
    };
  }, [workspaceSlug]);
}
