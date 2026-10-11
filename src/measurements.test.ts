import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { checkTemplate } from "./index";
import type { LabelTemplate } from "./types";

const log = "<CALL:1>I<EOR><CALL:3>WWW<EOR>";

function template(): LabelTemplate {
  return {
    labels: { width: 70, height: 36, columns: 1, rows: 1 },
    fields: [
      { field: "CALL", left: 0, y: 0, width: 50, height: 8, fontSize: 12 },
      { field: "CALL", left: 0, y: 8, width: 50, height: 8, fontSize: 24 },
      { text: "73", left: 0, y: 16, width: 50, height: 8, fontSize: 10 }
    ]
  };
}

describe("template measurements", () => {
  it("returns maximum dimensions in mm for each element, including repeated fields and constants", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const value = template();
    const result = await checkTemplate(log, value);
    expect(result.ok).toBe(true);
    expect(result.measurements).toHaveLength(3);
    for (const [index, measurement] of result.measurements.entries()) {
      expect(measurement.elementIndex).toBe(index);
      expect(measurement.measurable).toBe(true);
      if (!measurement.measurable) throw new Error("Expected measurable element");
      const size = value.fields[index].fontSize;
      expect(measurement.maxWidth).toBeCloseTo(font.widthOfTextAtSize(index === 2 ? "73" : "WWW", size) * 25.4 / 72);
      expect(measurement.maxHeight).toBeCloseTo(font.heightAtSize(size, { descender: true }) * 25.4 / 72);
    }
    expect(result.measurements[0]).toHaveProperty("field", "CALL");
    expect(result.measurements[2]).toHaveProperty("text", "73");
  });

  it("measures overflowing elements even outside the safety area", async () => {
    const value = template();
    value.labels.safety = { left: 2 };
    value.fields[0].width = 1;
    const result = await checkTemplate(log, value);
    expect(result.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "outside-printable-area", "text-does-not-fit"
    ]));
    expect(result.measurements[0]).toMatchObject({ measurable: true });
    const measurement = result.measurements[0];
    if (!measurement.measurable) throw new Error("Expected measurable element");
    expect(measurement.maxWidth).toBeGreaterThan(1);
  });

  it("marks an entire element unmeasurable if any contact has unsupported characters", async () => {
    const result = await checkTemplate("<CALL:1>A<EOR><CALL:4>😀<EOR>", template());
    expect(result.measurements[0]).toEqual({
      elementIndex: 0, field: "CALL", measurable: false, reason: "unsupported-character"
    });
    expect(result.measurements[2]).toMatchObject({ measurable: true });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unsupported-character", record: 2 })
    ]));
  });

  it("marks unavailable fonts explicitly", async () => {
    const value = template();
    value.fields[0].font = "MissingFont";
    const result = await checkTemplate(log, value);
    expect(result.measurements[0]).toEqual({
      elementIndex: 0, field: "CALL", measurable: false, reason: "unavailable-font"
    });
    expect(result.measurements[1]).toMatchObject({ measurable: true });
  });

  it("measures missing fields as empty strings", async () => {
    const result = await checkTemplate("<NAME:1>A<EOR>", template());
    expect(result.measurements[0]).toMatchObject({ measurable: true, maxWidth: 0 });
  });

  it("returns measurements consistently on empty logs and invalid templates", async () => {
    const empty = await checkTemplate("<EOH>", template());
    expect(empty.measurements).toHaveLength(3);
    expect(empty.measurements.every((item) => !item.measurable && item.reason === "no-records")).toBe(true);
    const invalid = await checkTemplate(log, "labels: {}");
    expect(invalid.measurements).toEqual([]);
    expect(invalid.ok).toBe(false);
  });
});
