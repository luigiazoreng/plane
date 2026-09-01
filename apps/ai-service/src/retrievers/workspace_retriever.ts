export interface WorkspaceContext {
  workspaceSlug: string;
  projectId?: string;
  projects?: Array<{ id: string; name: string; identifier: string }>;
  workItems?: Array<{ id: string; name: string; sequence_id: number; state_name?: string }>;
  cycles?: Array<{ id: string; name: string; status?: string }>;
  modules?: Array<{ id: string; name: string }>;
  pages?: Array<{ id: string; name: string }>;
  states?: Array<{ id: string; name: string; group?: string }>;
}

export class WorkspaceRetriever {
  private apiBaseUrl: string;
  private apiToken: string;

  constructor(apiBaseUrl?: string, apiToken?: string) {
    this.apiBaseUrl = apiBaseUrl || process.env.PLANE_API_URL || "http://localhost:8000/api/v1";
    this.apiToken = apiToken || process.env.PLANE_API_TOKEN || "";
  }

  async getWorkspaceContext(workspaceSlug: string, projectId?: string): Promise<WorkspaceContext> {
    if (!this.apiToken) {
      return {
        workspaceSlug,
        projectId,
        projects: [
          { id: "proj-1", name: "Mobile App", identifier: "MOB" },
          { id: "proj-2", name: "Web Application", identifier: "WEB" },
        ],
        workItems: [
          { id: "issue-1", name: "Fix login redirect loop", sequence_id: 101, state_name: "In Progress" },
          { id: "issue-2", name: "Add dark mode toggle", sequence_id: 102, state_name: "Todo" },
        ],
        cycles: [{ id: "cycle-1", name: "Sprint 24", status: "current" }],
        modules: [{ id: "mod-1", name: "Authentication" }],
        pages: [{ id: "page-1", name: "Architecture & Design Docs" }],
        states: [
          { id: "state-1", name: "Backlog", group: "backlog" },
          { id: "state-2", name: "In Progress", group: "started" },
          { id: "state-3", name: "Done", group: "completed" },
        ],
      };
    }

    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiToken,
      };

      const safeFetch = async (url: string) => {
        const res = await fetch(url, { headers });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : data.results || [];
      };

      const projectsPromise = safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/`);

      const workItemsPromise = projectId
        ? safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/issues/`)
        : Promise.resolve([]);

      const cyclesPromise = projectId
        ? safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`)
        : Promise.resolve([]);

      const modulesPromise = projectId
        ? safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/modules/`)
        : Promise.resolve([]);

      const pagesPromise = projectId
        ? safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/pages/`)
        : safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/pages/`);

      const statesPromise = projectId
        ? safeFetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/states/`)
        : Promise.resolve([]);

      const [projects, workItems, cycles, modules, pages, states] = await Promise.all([
        projectsPromise,
        workItemsPromise,
        cyclesPromise,
        modulesPromise,
        pagesPromise,
        statesPromise,
      ]);

      return {
        workspaceSlug,
        projectId,
        projects,
        workItems,
        cycles,
        modules,
        pages,
        states,
      };
    } catch (error) {
      console.warn(
        `[WorkspaceRetriever] Failed to fetch context from Plane API, falling back to basic context:`,
        error
      );
      return {
        workspaceSlug,
        projectId,
        projects: [],
        workItems: [],
        cycles: [],
        modules: [],
        pages: [],
        states: [],
      };
    }
  }

  async getIssueContext(workspaceSlug: string, projectId: string, issueId: string) {
    if (!this.apiToken) {
      return {
        issueId,
        name: "Fix login redirect loop",
        sequence_id: 101,
        description: "Users report getting trapped in auth redirect when session expires.",
        state: "In Progress",
      };
    }

    const headers = { "Content-Type": "application/json", "X-Api-Key": this.apiToken };
    const res = await fetch(`${this.apiBaseUrl}/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`, {
      headers,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch issue context: ${res.statusText}`);
    }

    return await res.json();
  }
}
