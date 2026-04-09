export type ViewerMode = "web" | "pdf";
export type SourceType = "web" | "pdf";
export type ProjectRole = "owner" | "editor" | "client" | "viewer";

export type Annotation = {
  id: string;
  mode: ViewerMode;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
};

export type ProjectRecord = {
  id: string;
  title: string;
  source_type: SourceType;
  source_url: string | null;
  asset_path: string | null;
  asset_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberRecord = {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
};

export type ProjectSummary = {
  membershipId: string;
  role: ProjectRole;
  project: ProjectRecord;
};

export type ProjectFormState = {
  title: string;
  sourceType: SourceType;
  sourceUrl: string;
  pdfFile: File | null;
};
