export const createRelation = async (workspaceId: string, projectId: string, issueId: string, targetIssueId: string, relationType: string) => {
    console.log(`[AI Agent] Creating ${relationType} relation between ${issueId} and ${targetIssueId}`);
    return { id: "relation-uuid", issueId, targetIssueId, relationType };
};
