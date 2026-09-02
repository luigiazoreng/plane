export interface CreateWorkItemPayload {
  name: string;
  description?: string;
  project_id: string;
  assignees?: string[];
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  state_id?: string;
}

export const createWorkItem = async (workspaceSlug: string, projectId: string, payload: CreateWorkItemPayload) => {
  const apiBaseUrl = process.env.PLANE_API_URL || "http://localhost:8000/api/v1";
  const apiToken = process.env.PLANE_API_TOKEN;

  console.log(`[AI Agent Tool] Creating work item in project ${projectId}:`, payload.name);

  if (!apiToken) {
    throw new Error("Plane API token missing. Configure PLANE_API_TOKEN environment variable.");
  }

  const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/issues/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiToken,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create work item: ${errText}`);
  }

  return await res.json();
};

export const updateWorkItem = async (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  payload: Partial<CreateWorkItemPayload>
) => {
  const apiBaseUrl = process.env.PLANE_API_URL || "http://localhost:8000/api/v1";
  const apiToken = process.env.PLANE_API_TOKEN;

  console.log(`[AI Agent Tool] Updating work item ${issueId}:`, payload);

  if (!apiToken) {
    throw new Error("Plane API token missing. Configure PLANE_API_TOKEN environment variable.");
  }

  const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiToken,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to update work item ${issueId}: ${errText}`);
  }

  return await res.json();
};
