export interface CreateModulePayload {
  name: string;
  description?: string;
  status?: string;
  lead?: string;
}

export const createModule = async (workspaceSlug: string, projectId: string, payload: CreateModulePayload) => {
  const apiBaseUrl = process.env.PLANE_API_URL || "http://localhost:8000/api/v1";
  const apiToken = process.env.PLANE_API_TOKEN;

  console.log(`[AI Agent Tool] Creating module in project ${projectId}:`, payload.name);

  if (!apiToken) {
    return {
      id: `module-${Date.now()}`,
      name: payload.name,
      project: projectId,
      workspace: workspaceSlug,
      status: "created_mock",
    };
  }

  const res = await fetch(`${apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/modules/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiToken,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create module: ${errText}`);
  }

  return await res.json();
};
