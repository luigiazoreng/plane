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
      throw new Error("Plane API token missing. Configure PLANE_API_TOKEN environment variable.");
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
      throw new Error("Plane API token missing. Configure PLANE_API_TOKEN environment variable.");
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
