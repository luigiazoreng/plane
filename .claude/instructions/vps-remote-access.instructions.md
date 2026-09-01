# VPS & Remote Server Terminal Protocol

## How VPS Access Works

The `run_in_terminal` tool can be used to open an SSH session as a **background** terminal. Once the user enters their password and confirms the connection is ready, subsequent `run_in_terminal` calls to that same terminal can execute commands directly on the VPS.

**Workflow:**
1. Open SSH with `run_in_terminal` (isBackground=true): `ssh <user>@<host>`
2. Tell the user to enter the password in that terminal
3. Wait for the user to say "go" (confirming they are connected)
4. Use `get_terminal_output` or `run_in_terminal` to send commands to the VPS via that terminal

---

## MANDATORY Terminal Rules

### Rule 1: SSH-first workflow for VPS commands

To run commands on the VPS:

1. **Open SSH** via `run_in_terminal` with `isBackground=true`:
   ```
   ssh <user>@<host>
   ```
2. **Tell the user** to enter the password in that terminal.
3. **Wait for "go"** — the user confirms they are connected.
4. **Run VPS commands** via `run_in_terminal` in the connected SSH terminal.

```
✅ run_in_terminal("ssh user@host", isBackground=true)  // Step 1: open connection
   → User enters password and says "go"
✅ run_in_terminal("docker ps --format '{{.Names}}\t{{.Status}}'")  // Step 4: runs ON VPS
✅ run_in_terminal("docker exec <container> command ...")  // runs ON VPS
```

**Important:** Do NOT attempt VPS commands before the user confirms the SSH session is active.

### Rule 2: One command per step, wait for output

Do NOT give 10 commands at once. Give 1-3 commands, wait for the user to share results, then decide the next commands based on what you know.

### Rule 3: Use local synced DB when possible

Before running VPS commands, check if the data exists locally. The `sync-local-db/sync-prod-to-local.sh` script syncs production databases to local Docker containers. Query local DB when available.

**Caveat**: Local DB is a snapshot from the last sync. Recent production data (created after the sync) won't exist locally. If a query returns 0 rows, the data may be newer than the sync — fall back to VPS commands.

### Rule 4: For logs and env vars, always use VPS

Container logs and environment variables only exist on the VPS. Always run these remotely via the SSH session.
