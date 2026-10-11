import { PDFDocument, PDFPage, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { checkTemplate, generatePdf, parseTemplate } from "./index";
import type { LabelTemplate } from "./types";

function template(): LabelTemplate {
  return {
    paper: { margin: { left: 5, top: 10 } },
    labels: {
      width: 70, height: 36, columns: 2, rows: 1, gapX: 3,
      safety: { left: 4, right: 2 }
    },
    fields: [{ field: "CALL", right: 2, y: 2, width: 20, height: 6, fontSize: 12 }]
  };
}

describe("horizontal field anchors", () => {
  it("preserves right in YAML and requires exactly one horizontal dimension", () => {
    const yaml = "labels: { width: 70, height: 36, columns: 1, rows: 1 }\nfields:\n  - { text: '73', right: 2, y: 2, width: 20, height: 6, fontSize: 12 }";
    expect(parseTemplate(yaml).fields[0].right).toBe(2);
    expect(parseTemplate(yaml.replace("right: 2", "left: 0")).fields[0].left).toBe(0);
    expect(() => parseTemplate(yaml.replace("right: 2, ", ""))).toThrow("exactly one");
    expect(() => parseTemplate(yaml.replace("right: 2", "right: 2, left: 0"))).toThrow("exactly one");
    expect(() => parseTemplate(yaml.replace("right: 2", "x: 2, xFrom: right"))).toThrow("replace x");
  });

  it.each(["left", "right"])("rejects invalid %s distances", (side) => {
    const yaml = `labels: { width: 70, height: 36, columns: 1, rows: 1 }\nfields:\n  - { text: '73', ${side}: -1, y: 2, width: 20, height: 6, fontSize: 12 }`;
    expect(() => parseTemplate(yaml)).toThrow(`fields[0].${side}`);
    expect(() => parseTemplate(yaml.replace(`${side}: -1`, `${side}: '2'`))).toThrow(`fields[0].${side}`);
  });

  it("checks safety margins against the resolved box without shifting its origin", async () => {
    const value = template();
    const log = "<CALL:5>DL1AA<EOR>";
    expect((await checkTemplate(log, value)).ok).toBe(true);
    value.fields[0] = { ...value.fields[0], left: undefined, right: 1 };
    expect((await checkTemplate(log, value)).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "outside-printable-area" })
    ]));
    value.fields[0] = { ...value.fields[0], left: undefined, right: 49 };
    const leftOverflow = await checkTemplate(log, value);
    expect(leftOverflow.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "outside-printable-area" })
    ]));
    expect(leftOverflow.measurements[0]).toMatchObject({ measurable: true });
  });

  it.each(["left", "center", "right"] as const)("renders right-anchored boxes with %s text alignment on each label", async (align) => {
    const value = template();
    value.fields[0].align = align;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pt = 72 / 25.4;
    const textWidth = font.widthOfTextAtSize("DL1AA", 12);
    const offset = align === "left" ? 0 : (20 * pt - textWidth) / (align === "center" ? 2 : 1);
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    try {
      await generatePdf("<CALL:5>DL1AA<EOR><CALL:5>DL1AA<EOR>", value);
      expect(drawText.mock.calls[0][1]!.x).toBeCloseTo((5 + 48) * pt + offset);
      expect(drawText.mock.calls[1][1]!.x).toBeCloseTo((5 + 73 + 48) * pt + offset);
    } finally {
      drawText.mockRestore();
    }
  });

  it("renders left and right distances for constants", async () => {
    const value = template();
    value.fields = [{ text: "73", left: 4, y: 2, width: 20, height: 6, fontSize: 12 }];
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    try {
      await generatePdf("<CALL:5>DL1AA<EOR>", value);
      expect(drawText.mock.calls[0][1]!.x).toBeCloseTo((5 + 4) * 72 / 25.4);
      value.fields[0] = { ...value.fields[0], left: undefined, right: 4 };
      await generatePdf("<CALL:5>DL1AA<EOR>", value);
      expect(drawText.mock.calls[1][1]!.x).toBeCloseTo((5 + 70 - 4 - 20) * 72 / 25.4);
    } finally {
      drawText.mockRestore();
    }
  });
});
