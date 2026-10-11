export const supportedLogFormats = ["adif", "cabrillo", "edi"] as const;

export type SupportedLogFormat = (typeof supportedLogFormats)[number];
export type LogInput = string | Uint8Array;
export type LogRecord = Record<string, string>;

export interface ParsedLog {
  format: SupportedLogFormat;
  records: LogRecord[];
}

export type TemplateInput = string | LabelTemplate;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PaperTemplate {
  size?: "A3" | "A4" | "A5" | "Letter" | "Legal" | "custom";
  orientation?: "portrait" | "landscape";
  width?: number;
  height?: number;
  margin?: Partial<Insets>;
}

export interface LabelLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  gapX?: number;
  gapY?: number;
  /** @deprecated Use paper.margin instead. */
  margin?: Partial<Insets>;
  safety?: Partial<Insets>;
}

export interface TemplateItem {
  field?: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  font?: string;
  align?: "left" | "center" | "right";
}

export interface LabelTemplate {
  paper?: PaperTemplate;
  labels: LabelLayout;
  fields: TemplateItem[];
}

export type PaperSettings = Omit<PaperTemplate, "margin">;
export type LabelSize = Pick<LabelLayout, "width" | "height">;
export type GridLayout = Pick<LabelLayout, "columns" | "rows" | "gapX" | "gapY">;

export interface TemplateLayout {
  paper: PaperSettings & {
    size: NonNullable<PaperTemplate["size"]>;
    orientation: NonNullable<PaperTemplate["orientation"]>;
    margin: Insets;
  };
  labels: LabelSize & GridLayout;
}

export interface FontOptions {
  fonts?: Record<string, Uint8Array>;
  format?: SupportedLogFormat;
}

export interface TemplateProblem {
  code:
    | "invalid-template"
    | "no-records"
    | "outside-paper"
    | "outside-printable-area"
    | "text-does-not-fit"
    | "unsupported-character";
  message: string;
  record?: number;
  field?: string;
}

export interface TemplateCheckResult {
  ok: boolean;
  errors: TemplateProblem[];
}
