import { api } from "./client";

export interface JobTemplate {
  id:                  number;
  name:                string;
  pickupTextSnapshot:  string;
  dropoffTextSnapshot: string;
  defaultReference:    string | null;
  defaultMaterialType: string | null;
  defaultNotes:        string | null;
  status:              "active" | "archived";
  createdAt:           string;
}

export async function listTemplates(): Promise<JobTemplate[]> {
  const res = await api.get<{ data: JobTemplate[] }>("/job-templates");
  return res.data;
}

export async function createTemplate(body: {
  name:                string;
  pickupTextSnapshot:  string;
  dropoffTextSnapshot: string;
  defaultReference?:   string;
  defaultMaterialType?: string;
  defaultNotes?:       string;
}): Promise<JobTemplate> {
  const res = await api.post<{ data: JobTemplate }>("/job-templates", body);
  return res.data;
}

export async function archiveTemplate(id: number): Promise<void> {
  await api.patch(`/job-templates/${id}`, { status: "archived" });
}

export const templatesApi = { listTemplates, createTemplate, archiveTemplate };
