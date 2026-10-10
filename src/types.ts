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
}

export interface LabelLayout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  gapX?: number;
  gapY?: number;
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
