/**
 * Fetchers for Projects + Clients Notion databases.
 *
 * Projects DB : 239ddc8e-9208-8186-b452-cc35f89677ff
 * Clients DB  : 239ddc8e-9208-8102-86b9-eda32f63e815
 *
 * Server-side only — NOTION_TOKEN must be available in env.
 * Runtime implementations: supabase/functions/notion-sync/ (Deno)
 * and integrations/apps-script/Code.gs (Google Apps Script).
 */

import {
  queryDatabase,
  getPage,
  getText,
  getSelect,
  getMultiSelect,
  getNumber,
  getDate,
  getEmail,
  getUrl,
  getRelation,
  getCheckbox,
  getBlocks,
  updatePage,
  createDatabasePage,
  archivePage,
  type NotionBlock,
  type NotionProperty,
} from "./client";

export const DB_PROJECTS = "239ddc8e-9208-8186-b452-cc35f89677ff";
export const DB_CLIENTS  = "239ddc8e-9208-8102-86b9-eda32f63e815";

export type ProjectStatus = "In uitvoering" | "Gepland" | "Gepauzeerd" | "Opgeleverd";
export type Priority      = "High" | "Medium" | "Low";

export interface Project {
  id: string;
  url: string;
  name: string;
  status: ProjectStatus | null;
  type: string[];
  prioriteit: Priority | null;
  startDatum: string | null;
  deadline: string | null;
  budget: number | null;
  clientIds: string[];
}

export interface ProjectDetail extends Project {
  notes: string;
  taskDbId: string | null;
}

export interface Task {
  id: string;
  name: string;
  done: boolean;
  dueDate: string | null;
  assignee: string | null;
  priority: string | null;
  status: string | null;
}

export type ClientStatus = "Active" | "Inactive" | "Lead" | "Prospect" | "Past" | "Planned";

export interface Client {
  id: string;
  url: string;
  name: string;
  clientStatus: ClientStatus | null;
  crmStatus: string | null;
  firstContact: string | null;
  email: string | null;
  websiteUrl: string | null;
  potentie: string | null;
  scope: number | null;
}

function blockToText(block: NotionBlock): string {
  const content = (block as Record<string, unknown>)[block.type] as
    | { rich_text: Array<{ plain_text: string }> }
    | undefined;
  if (!content?.rich_text) return "";
  return content.rich_text.map((t) => t.plain_text).join("");
}

function mapProject(p: { id: string; url: string; properties: Record<string, NotionProperty> }): Project {
  return {
    id:         p.id,
    url:        p.url,
    name:       getText(p.properties["Name"]),
    status:     getSelect(p.properties["Status"]) as ProjectStatus | null,
    type:       getMultiSelect(p.properties["Type"]),
    prioriteit: getSelect(p.properties["Prioriteit"]) as Priority | null,
    startDatum: getDate(p.properties["Start Datum"]),
    deadline:   getDate(p.properties["Deadline"]),
    budget:     getNumber(p.properties["Budget"]),
    clientIds:  getRelation(p.properties["Client"]),
  };
}

export async function fetchProjects(): Promise<Project[]> {
  const pages = await queryDatabase(DB_PROJECTS, undefined, [
    { property: "Status", direction: "ascending" },
  ]);
  return pages.map(mapProject).filter((p) => p.name && !p.name.startsWith("{"));
}

export async function fetchProjectDetail(projectId: string): Promise<ProjectDetail> {
  const [page, blocks] = await Promise.all([
    getPage(projectId),
    getBlocks(projectId),
  ]);

  const base = mapProject(page);

  const noteTypes = new Set([
    "paragraph", "heading_1", "heading_2", "heading_3",
    "bulleted_list_item", "numbered_list_item", "quote", "callout",
  ]);
  const notes = blocks
    .filter((b) => noteTypes.has(b.type))
    .map(blockToText)
    .filter(Boolean)
    .join("\n");

  const childDb = blocks.find((b) => b.type === "child_database") as
    | (NotionBlock & { child_database: { title: string } })
    | undefined;

  return {
    ...base,
    notes,
    taskDbId: childDb?.id ?? null,
  };
}

export async function fetchProjectTasks(taskDbId: string): Promise<Task[]> {
  const pages = await queryDatabase(taskDbId, undefined, [
    { property: "Name", direction: "ascending" },
  ]);
  return pages
    .map((p) => ({
      id:       p.id,
      name:     getText(p.properties["Name"]) || getText(p.properties["Taak"]) || getText(p.properties["Task"]),
      done:     getCheckbox(p.properties["Done"]) || getCheckbox(p.properties["Afgerond"]) || getSelect(p.properties["Status"]) === "Done",
      dueDate:  getDate(p.properties["Due Date"]) ?? getDate(p.properties["Deadline"]),
      assignee: getText(p.properties["Assignee"]),
      priority: getSelect(p.properties["Priority"]) ?? getSelect(p.properties["Prioriteit"]),
      status:   getSelect(p.properties["Status"]),
    }))
    .filter((t) => t.name);
}

export async function updateProject(
  projectId: string,
  patch: Partial<{
    status: string;
    prioriteit: string;
    startDatum: string | null;
    deadline: string | null;
    budget: number | null;
  }>
): Promise<void> {
  const properties: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    properties["Status"] = { status: { name: patch.status } };
  }
  if (patch.prioriteit !== undefined) {
    properties["Prioriteit"] = { select: { name: patch.prioriteit } };
  }
  if ("startDatum" in patch) {
    properties["Start Datum"] = patch.startDatum
      ? { date: { start: patch.startDatum } }
      : { date: null };
  }
  if ("deadline" in patch) {
    properties["Deadline"] = patch.deadline
      ? { date: { start: patch.deadline } }
      : { date: null };
  }
  if ("budget" in patch) {
    properties["Budget"] = { number: patch.budget };
  }
  await updatePage(projectId, properties);
}

export async function createTask(
  taskDbId: string,
  name: string,
  dueDate?: string | null
): Promise<Task> {
  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: name } }] },
  };
  if (dueDate) {
    properties["Due Date"] = { date: { start: dueDate } };
  }
  const page = await createDatabasePage(taskDbId, properties);
  return {
    id:       page.id,
    name,
    done:     false,
    dueDate:  dueDate ?? null,
    assignee: null,
    priority: null,
    status:   null,
  };
}

export async function toggleTask(taskId: string, done: boolean): Promise<void> {
  await updatePage(taskId, {
    Done:     { checkbox: done },
    Afgerond: { checkbox: done },
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await archivePage(taskId);
}

export async function fetchClients(): Promise<Client[]> {
  const pages = await queryDatabase(DB_CLIENTS, undefined, [
    { property: "Name", direction: "ascending" },
  ]);
  return pages
    .map((p) => ({
      id:           p.id,
      url:          p.url,
      name:         getText(p.properties["Name"]),
      clientStatus: getSelect(p.properties["Client Status"]) as ClientStatus | null,
      crmStatus:    getSelect(p.properties["CRM Status"]),
      firstContact: getDate(p.properties["First Contact"]),
      email:        getEmail(p.properties["Email"]),
      websiteUrl:   getUrl(p.properties["Website URL"]),
      potentie:     getSelect(p.properties["Potentie"]),
      scope:        getNumber(p.properties["Scope"]),
    }))
    .filter((c) => c.name);
}
