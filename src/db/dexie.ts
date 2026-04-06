import Dexie, { type EntityTable } from "dexie";

interface OfflineProject {
  id: string;
  name: string;
  data: string; // JSON stringified project data
  syncedAt: string | null;
}

interface OfflineCutProgress {
  id: string;
  projectId: string;
  color: string;
  status: "pending" | "done";
  cutAt: string | null;
  synced: boolean;
}

const db = new Dexie("SteboReclameDB") as Dexie & {
  projects: EntityTable<OfflineProject, "id">;
  cutProgress: EntityTable<OfflineCutProgress, "id">;
};

db.version(1).stores({
  projects: "id, name, syncedAt",
  cutProgress: "id, projectId, color, status, synced, [projectId+color]",
});

export { db };
export type { OfflineProject, OfflineCutProgress };
