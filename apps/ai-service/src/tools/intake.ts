export const triageIntakeItem = async (workspaceId: string, projectId: string, intakeId: string, action: string, payload: any) => {
    console.log(`[AI Agent] Triaging intake ${intakeId} with action ${action}:`, payload);
    return { id: intakeId, status: action, ...payload };
};
