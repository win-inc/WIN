export type ViewerMode = "web" | "pdf";

export type Annotation = {
  id: number;
  mode: ViewerMode;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
};
