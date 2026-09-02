export interface CreateCyclePayload {
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export const createCycle = async (workspaceSlug: string, projectId: string, payload: CreateCyclePayload) => {
  const apiBaseUrl = process.env.PLANE_API_URL || "http://localhost:8000/api/v1";
  const apiToken = process.env.PLANE_API_TOKEN;

  console.log(`[AI Agent Tool] Creating cycle in project ${projectId}:`, payload.name);

  if (!apiToken) {
    throw new Error("Plane API token missing. Configure PLANE_API_TOKEN environment variable.");
  }

  const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiToken,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create cycle: ${errText}`);
  }

  return await res.json();
};
