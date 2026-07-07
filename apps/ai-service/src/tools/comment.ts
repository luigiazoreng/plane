export const createComment = async (workspaceId: string, projectId: string, issueId: string, payload: any) => {
    console.log(`[AI Agent] Creating comment on ${issueId}:`, payload);
    return { id: "comment-uuid", ...payload };
};
