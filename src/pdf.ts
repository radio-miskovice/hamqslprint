import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont
} from "pdf-lib";
import { normalizeTemplate, parseTemplate, TemplateError } from "./template";
import type {
  FontOptions,
  LabelTemplate,
  LogInput,
  TemplateCheckResult,
  TemplateInput,
  TemplateProblem,
  TemplateItem,
  TemplateMeasurement
} from "./types";
import { parseLog } from "./logs";

const MILLIMETRES_TO_POINTS = 72 / 25.4;
const standardFonts: Record<string, string> = {
  courier: StandardFonts.Courier,
  "courier-bold": StandardFonts.CourierBold,
  "courier-oblique": StandardFonts.CourierOblique,
  "courier-boldoblique": StandardFonts.CourierBoldOblique,
  helvetica: StandardFonts.Helvetica,
  "helvetica-bold": StandardFonts.HelveticaBold,
  "helvetica-oblique": StandardFonts.HelveticaOblique,
  "helvetica-boldoblique": StandardFonts.HelveticaBoldOblique,
  "times-roman": StandardFonts.TimesRoman,
  "times-bold": StandardFonts.TimesRomanBold,
  "times-italic": StandardFonts.TimesRomanItalic,
  "times-bolditalic": StandardFonts.TimesRomanBoldItalic,
  symbol: StandardFonts.Symbol,
  zapfdingbats: StandardFonts.ZapfDingbats
};

interface ResolvedItem {
  item: TemplateItem;
  text: string;
  name: string;
  recordIndex?: number;
}

export async function checkTemplate(
  log: LogInput,
  templateInput: TemplateInput,
  options: FontOptions = {}
): Promise<TemplateCheckResult> {
  let template: LabelTemplate;
  let layout;
  try {
    template = parseTemplate(templateInput);
    layout = normalizeTemplate(template);
  } catch (error) {
    if (error instanceof TemplateError) {
      return {
        ok: false,
        errors: [{ code: "invalid-template", message: error.message }],
        measurements: []
      };
    }
    throw error;
  }

  const { records } = parseLog(log, options.format);
  if (records.length === 0) {
    return {
      ok: false,
      errors: [{ code: "no-records", message: "Log contains no contact records." }],
      measurements: layout.fields.map((item, elementIndex) => ({
        elementIndex,
        ...(item.field === undefined ? { text: item.text } : { field: item.field }),
        measurable: false,
        reason: "no-records"
      }))
    };
  }
  const errors: TemplateProblem[] = [];
  const measurements: TemplateMeasurement[] = [];
  const checkedFonts = new Map<string, PDFFont | undefined>();
  const characterSets = new Map<string, Set<number>>();

  for (const [itemIndex, item] of layout.fields.entries()) {
    const name = item.field ?? `constant ${itemIndex + 1}`;
    const minX = layout.labels.safety.left;
    const minY = layout.labels.safety.top;
    const maxX = layout.labels.width - layout.labels.safety.right;
    const maxY = layout.labels.height - layout.labels.safety.bottom;
    const boxX = fieldBoxX(item, layout.labels.width);
    if (
      boxX < minX ||
      item.y < minY ||
      boxX + item.width > maxX ||
      item.y + item.height > maxY
    ) {
      errors.push({
        code: "outside-printable-area",
        field: name,
        message: `${name} field box exceeds the label's safety margins.`
      });
    }
    const identity = {
      elementIndex: itemIndex,
      ...(item.field === undefined ? { text: item.text } : { field: item.field })
    };
    let maxWidth = 0;
    let maxHeight = 0;
    let failure: "unavailable-font" | "unsupported-character" | undefined;
    for (const resolved of resolveItem(item, records, itemIndex)) {
      const fontName = resolved.item.font ?? "Helvetica";
      if (!checkedFonts.has(fontName)) {
        checkedFonts.set(fontName, await loadFontForCheck(fontName, options));
      }
      const font = checkedFonts.get(fontName);
      if (!font) {
        failure = "unavailable-font";
        errors.push({
          code: "invalid-template",
          field: name,
          message: `Font "${fontName}" is not a standard PDF font and no font data was provided.`
        });
        break;
      }
      if (!characterSets.has(fontName)) {
        characterSets.set(fontName, new Set(font.getCharacterSet()));
      }
      const characterSet = characterSets.get(fontName)!;
      if ([...resolved.text].some((character) => !characterSet.has(character.codePointAt(0)!))) {
        failure = "unsupported-character";
        errors.push({
          code: "unsupported-character",
          field: name,
          ...(resolved.recordIndex === undefined ? {} : { record: resolved.recordIndex }),
          message: `${name} contains characters that font "${fontName}" cannot render.`
        });
        continue;
      }
      const width = font.widthOfTextAtSize(resolved.text, item.fontSize);
      const height = font.heightAtSize(item.fontSize, { descender: true });
      maxWidth = Math.max(maxWidth, width / MILLIMETRES_TO_POINTS);
      maxHeight = Math.max(maxHeight, height / MILLIMETRES_TO_POINTS);
      if (
        width > item.width * MILLIMETRES_TO_POINTS + 1e-6 ||
        height > item.height * MILLIMETRES_TO_POINTS + 1e-6
      ) {
        errors.push({
          code: "text-does-not-fit",
          field: name,
          ...(resolved.recordIndex === undefined ? {} : { record: resolved.recordIndex }),
          message: `${name}${resolved.recordIndex === undefined ? "" : ` on record ${resolved.recordIndex}`} does not fit its ${item.width}×${item.height} mm field box.`
        });
      }
    }
    measurements.push(failure
      ? { ...identity, measurable: false, reason: failure }
      : { ...identity, measurable: true, maxWidth, maxHeight });
  }
  return { ok: errors.length === 0, errors, measurements };
}

export async function generatePdf(
  log: LogInput,
  templateInput: TemplateInput,
  target: "none" | string = "none",
  options: FontOptions = {}
): Promise<Uint8Array | void> {
  const template = parseTemplate(templateInput);
  const layout = normalizeTemplate(template);
  const { records } = parseLog(log, options.format);
  if (records.length === 0) throw new TemplateError("Log contains no contact records.");

  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts = new Map<string, PDFFont>();
  const getFont = async (name = "Helvetica"): Promise<PDFFont> => {
    const cached = fonts.get(name);
    if (cached) return cached;
    const custom = options.fonts?.[name];
    const standard = standardFonts[name.toLowerCase()];
    if (!custom && !standard) {
      throw new TemplateError(
        `Font "${name}" is not a standard PDF font and no font data was provided.`
      );
    }
    const font = await document.embedFont(custom ?? standard);
    fonts.set(name, font);
    return font;
  };

  const { labels } = layout;
  const pageCapacity = labels.columns * labels.rows;
  const pageCount = Math.max(1, Math.ceil(records.length / pageCapacity));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = document.addPage([
      layout.paperWidth * MILLIMETRES_TO_POINTS,
      layout.paperHeight * MILLIMETRES_TO_POINTS
    ]);
    const start = pageIndex * pageCapacity;
    const end = Math.min(start + pageCapacity, records.length);
    for (let recordIndex = start; recordIndex < end; recordIndex++) {
      const labelIndex = recordIndex - start;
      const column = labelIndex % labels.columns;
      const row = Math.floor(labelIndex / labels.columns);
      const labelX = (labels.margin.left + column * (labels.width + labels.gapX)) * MILLIMETRES_TO_POINTS;
      const labelTop = (labels.margin.top + row * (labels.height + labels.gapY)) * MILLIMETRES_TO_POINTS;
      for (const item of layout.fields) {
        const name = item.field ?? "";
        const text = item.field ? records[recordIndex][item.field] ?? "" : item.text ?? "";
        if (!text) continue;
        const fontName = item.font ?? "Helvetica";
        const font = await getFont(fontName);
        const textWidth = font.widthOfTextAtSize(text, item.fontSize);
        const boxWidth = item.width * MILLIMETRES_TO_POINTS;
        const align = item.align ?? "left";
        const xOffset = align === "right" ? boxWidth - textWidth : align === "center" ? (boxWidth - textWidth) / 2 : 0;
        const ascentHeight = font.heightAtSize(item.fontSize);
        const textHeight = font.heightAtSize(item.fontSize, { descender: true });
        const boxHeight = item.height * MILLIMETRES_TO_POINTS;
        const baselineFromBottom =
          (boxHeight - textHeight) / 2 + textHeight - ascentHeight;
        page.drawText(text, {
          x: labelX + fieldBoxX(item, labels.width) * MILLIMETRES_TO_POINTS + xOffset,
          y:
            layout.paperHeight * MILLIMETRES_TO_POINTS -
            labelTop -
            (item.y + item.height) * MILLIMETRES_TO_POINTS +
            baselineFromBottom,
          size: item.fontSize,
          font,
          color: rgb(0, 0, 0)
        });
      }
    }
  }

  const pdfBytes = await document.save();
  if (target === "none") return pdfBytes;
  const fs = await import("node:fs/promises");
  await fs.writeFile(target, pdfBytes);
}

function fieldBoxX(item: TemplateItem, labelWidth: number): number {
  return item.left !== undefined ? item.left : labelWidth - item.right - item.width;
}

function resolveItem(
  item: TemplateItem,
  records: Record<string, string>[],
  index: number
): ResolvedItem[] {
  if (!item.field) return [{ item, text: item.text ?? "", name: `constant ${index + 1}` }];
  return records.map((record, recordIndex) => ({
    item,
    text: record[item.field!] ?? "",
    name: item.field!,
    recordIndex: recordIndex + 1
  }));
}

async function loadFontForCheck(name: string, options: FontOptions): Promise<PDFFont | undefined> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  if (options.fonts?.[name]) return pdf.embedFont(options.fonts[name]);
  const standard = standardFonts[name.toLowerCase()];
  return standard ? pdf.embedFont(standard) : undefined;
}
