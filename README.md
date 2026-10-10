# hamqslprint

An npm library for generating QSL-label PDFs from amateur radio log files and
YAML label templates.

## API

The input log can be UTF-8 text or a `Uint8Array`. Formats are detected from
their contents; pass an explicit format when detection is not possible.

```ts
import { checkTemplate, generatePdf, selectFields } from "hamqslprint";

const fields = selectFields(adifText);
const check = await checkTemplate(adifText, templateYaml);
if (!check.ok) console.error(check.errors);

const pdf = await generatePdf(adifText, templateYaml); // Uint8Array
await generatePdf(adifText, templateYaml, "labels.pdf"); // writes in Node.js
```

`checkTemplate` accepts an options object as its third argument, and
`generatePdf` accepts one as its fourth argument. Use
`{ format: "edi" }` or `{ format: "cabrillo" }` when format detection is
ambiguous. The same options object can provide custom fonts as
`{ fonts: { "MyFont": fontBytes } }`.
Without custom font data, use one of the PDF standard fonts: `Helvetica`,
`Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-BoldOblique`, `Times-Roman`,
`Times-Bold`, `Times-Italic`, `Times-BoldItalic`, `Courier`, `Courier-Bold`,
`Courier-Oblique`, `Courier-BoldOblique`, `Symbol`, or `ZapfDingbats`.

### YAML template

All measurements are in millimetres; font sizes are in PDF points. Label field
coordinates are measured from the label's top-left corner. The paper defaults
to A4 portrait, and unspecified gaps and margins default to zero.

```yaml
paper:
  size: A4 # A3, A4, A5, Letter, Legal, or custom
  orientation: portrait # portrait or landscape
  # For custom paper, use size: custom and provide width and height.
labels:
  width: 65
  height: 34
  columns: 3
  rows: 8
  gapX: 0
  gapY: 0
  margin: { top: 10, right: 5, bottom: 5, left: 5 }
  safety: { top: 2, right: 2, bottom: 2, left: 2 }
fields:
  - field: CALL # ADIF field name; one label is produced per log record
    x: 2
    y: 2
    width: 50
    height: 7
    font: Helvetica-Bold
    fontSize: 14
    align: left # left, center, or right
  - text: "Thanks for the QSO!" # constant text
    x: 2
    y: 12
    width: 50
    height: 5
    fontSize: 9
```

Field box positions and dimensions must stay within the label's safety margins.
The checker verifies every contact value fits both its box and selected font's
character set. Constants are checked once; missing contact fields render as an
empty string. Contacts are placed in row-major order, with one PDF page per
label sheet.

Cabrillo and EDI QSO data are exposed using ADIF-style field names where a
corresponding value exists. Cabrillo QSO columns follow the standard frequency,
mode, date, time, sent call/report/exchange, received call/report/exchange
ordering; frequencies above 1000 are converted from kHz to ADIF MHz. EDI records use the common REG1TEST QSO record order, including
date, time, call, mode, reports, serials, locator, and frequency.

The PDF returned for target `"none"` works in browser and Node applications.
File-path output requires Node.js.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
```
