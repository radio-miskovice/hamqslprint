import { describe, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { stringify } from "yaml";
import { checkTemplate, createTemplateLayout, generatePdf, parseTemplate } from "./index";
import { normalizeTemplate } from "./template";
import type { LabelTemplate } from "./types";

function template(): LabelTemplate {
  return {
    labels: { width: 65, height: 34, columns: 3, rows: 8 },
    fields: [{ text: "73", left: 2, y: 2, width: 40, height: 6, fontSize: 12 }]
  };
}

describe("creating template layouts", () => {
  it("centers the requested 3 by 8 grid on A4 portrait", () => {
    const layout = createTemplateLayout("A4", { width: 70, height: 36 }, { columns: 3, rows: 8 });
    expect(layout).toEqual({
      paper: {
        size: "A4",
        orientation: "portrait",
        margin: { top: 4.5, bottom: 4.5, left: 0, right: 0 }
      },
      labels: { columns: 3, rows: 8, width: 70, height: 36 }
    });
    expect(layout).not.toHaveProperty("fields");
    const fullTemplate = parseTemplate(stringify({ ...layout, fields: template().fields }));
    expect(normalizeTemplate(fullTemplate).labels.margin).toEqual(layout.paper.margin);
  });

  it("supports landscape paper and includes gaps in the grid dimensions", () => {
    const layout = createTemplateLayout(
      { size: "A4", orientation: "landscape" },
      { width: 70, height: 36 },
      { columns: 4, rows: 5, gapX: 2, gapY: 1 }
    );
    expect(layout.paper.margin).toEqual({ left: 5.5, right: 5.5, top: 13, bottom: 13 });
    expect(layout.labels).toMatchObject({ gapX: 2, gapY: 1 });
  });

  it("supports custom paper and exact fits without modifying inputs", () => {
    const paper = { size: "custom", width: 100, height: 80 } as const;
    const label = { width: 50, height: 40 };
    const grid = { columns: 2, rows: 2 };
    const layout = createTemplateLayout(paper, label, grid);
    expect(layout.paper).toEqual({
      ...paper, orientation: "portrait",
      margin: { left: 0, right: 0, top: 0, bottom: 0 }
    });
    expect(paper).not.toHaveProperty("margin");
    expect(layout.labels).not.toBe(label);
    expect(layout.labels).not.toBe(grid);
  });

  it("defaults paper settings to A4 portrait", () => {
    expect(createTemplateLayout({}, { width: 70, height: 36 }, { columns: 3, rows: 8 }).paper)
      .toMatchObject({ size: "A4", orientation: "portrait" });
  });

  it.each([
    { columns: 8, rows: 3 },
    { columns: 3, rows: 9 },
    { columns: 3, rows: 8, gapX: 1 }
  ])("rejects oversized grids %j", (grid) => {
    expect(() => createTemplateLayout("A4", { width: 70, height: 36 }, grid)).toThrow("exceeds");
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid label widths %s", (width) => {
    expect(() => createTemplateLayout("A4", { width, height: 36 }, { columns: 3, rows: 8 }))
      .toThrow("labels.width");
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid column counts %s", (columns) => {
    expect(() => createTemplateLayout("A4", { width: 70, height: 36 }, { columns, rows: 8 }))
      .toThrow("labels.columns");
  });

  it("rejects invalid gaps and missing custom dimensions", () => {
    expect(() => createTemplateLayout("A4", { width: 70, height: 36 }, { columns: 3, rows: 8, gapY: -1 }))
      .toThrow("labels.gapY");
    expect(() => createTemplateLayout("custom", { width: 70, height: 36 }, { columns: 3, rows: 8 }))
      .toThrow("paper.width");
  });
});

describe("paper margins", () => {
  it("defaults omitted sides to zero and preserves legacy margins", () => {
    expect(normalizeTemplate(parseTemplate(template())).labels.margin)
      .toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    const current = template();
    current.paper = { margin: { top: 10, left: 5 } };
    const legacy = template();
    legacy.labels.margin = { top: 10, left: 5 };
    expect(normalizeTemplate(parseTemplate(current)))
      .toEqual(normalizeTemplate(parseTemplate(legacy)));
    expect(normalizeTemplate(parseTemplate(current)).labels.margin)
      .toEqual({ top: 10, right: 0, bottom: 0, left: 5 });
  });

  it.each(["top", "bottom", "left", "right"] as const)("validates paper.margin.%s", (side) => {
    const value = template();
    value.paper = { margin: { [side]: -1 } };
    expect(() => parseTemplate(value)).toThrow(`paper.margin.${side}`);
  });

  it("rejects a non-object margin in YAML", () => {
    expect(() => parseTemplate("paper: { margin: 5 }")).toThrow("paper.margin must be a mapping");
  });

  it("rejects both margin locations, including repeated parsing", () => {
    const value = template();
    value.paper = { margin: {} };
    value.labels.margin = {};
    expect(() => parseTemplate(value)).toThrow("not both");
    delete value.labels.margin;
    expect(() => parseTemplate(parseTemplate(value))).not.toThrow();
  });

  it.each(["top", "bottom", "left", "right"] as const)("includes %s margin in grid fit checks", async (side) => {
    const value = template();
    value.paper = { margin: { [side]: 30 } };
    const result = await checkTemplate("<CALL:5>DL1AA<EOR>", value);
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: "invalid-template", message: expect.stringContaining("exceed") }]
    });
  });

  it("offsets PDF text by the paper left and top margins", async () => {
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    try {
      const value = template();
      const log = "<CALL:5>DL1AA<EOR>";
      await generatePdf(log, value);
      const original = drawText.mock.calls[0][1]!;
      drawText.mockClear();
      value.paper = { margin: { top: 10, left: 5, right: 5, bottom: 5 } };
      await generatePdf(log, value);
      const offset = drawText.mock.calls[0][1]!;
      expect(offset.x! - original.x!).toBeCloseTo(5 * 72 / 25.4);
      expect(offset.y! - original.y!).toBeCloseTo(-10 * 72 / 25.4);
    } finally {
      drawText.mockRestore();
    }
  });
});
