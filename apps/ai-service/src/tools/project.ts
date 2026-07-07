export const createProject = async (workspaceId: string, payload: any) => {
    console.log(`[AI Agent] Creating project in ${workspaceId}:`, payload);
    return { id: "project-uuid", ...payload };
};

export const updateProject = async (workspaceId: string, projectId: string, payload: any) => {
    console.log(`[AI Agent] Updating project ${projectId}:`, payload);
    return { id: projectId, ...payload };
};
