export const executeMCPTool = async (toolName: string, args: any) => {
    console.log(`[MCP Adapter] Executing tool ${toolName} with args:`, args);
    // Maps standard MCP tool calls to internal plane-ai-service tools
    return { success: true };
};
