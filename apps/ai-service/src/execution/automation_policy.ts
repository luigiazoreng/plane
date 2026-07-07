export const isActionAllowedWithoutApproval = (workspaceId: string, actionType: string, _payload: any) => {
    // Only very low risk actions can run autonomously without human approval
    const allowList = ["triage_intake_item", "add_label"];
    
    if (allowList.includes(actionType)) {
        return true;
    }
    
    return false;
};
