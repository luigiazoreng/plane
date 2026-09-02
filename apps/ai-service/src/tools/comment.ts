export interface CreateCommentPayload {
  comment_html: string;
}

export const createComment = async (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  payload: CreateCommentPayload
) => {
  const apiBaseUrl = process.env.PLANE_API_URL || "http://localhost:8000/api/v1";
  const apiToken = process.env.PLANE_API_TOKEN;

  console.log(`[AI Agent Tool] Creating comment on issue ${issueId}`);

  if (!apiToken) {
    throw new Error("Plane API token missing. Configure PLANE_API_TOKEN environment variable.");
  }

  const res = await fetch(
    `${apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiToken,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create comment: ${errText}`);
  }

  return await res.json();
};
