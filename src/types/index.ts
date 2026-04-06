export interface Project {
  id: string;
  name: string;
  client_name: string | null;
  roll_width: number; // mm: 630 or 1260
  price_per_m: number | null;
  created_at: string;
  updated_at: string;
}

export interface Design {
  id: string;
  project_id: string;
  file_path: string;
  file_name: string;
  colors: string[]; // hex colors
  width_mm: number | null;
  height_mm: number | null;
  created_at: string;
}

export interface Preview {
  id: string;
  project_id: string;
  photo_path: string;
  corners: [number, number][]; // 4 corner points
  export_path: string | null;
}

export interface CutStep {
  id: string;
  project_id: string;
  color: string;
  order_num: number;
  length_mm: number;
  status: "pending" | "done";
  cut_at: string | null;
}

export interface SvgElement {
  id: string;
  tagName: string;
  fill: string;
  pathData: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface ColorGroup {
  color: string;
  elements: SvgElement[];
  totalArea: number; // mm²
  requiredLength: number; // mm on the roll
  meters: number;
  cost: number | null;
}
