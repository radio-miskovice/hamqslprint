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

The [template schema](schema/template.yaml) is JSON Schema (Draft 2020-12)
encoded as YAML. It describes the template structure and defaults; geometric
and content-dependent checks still require `checkTemplate`. Schema defaults
are documentation annotations, not automatic value insertion.

All measurements are in millimetres; font sizes are in PDF points. Label field
coordinates are measured from the label's top-left corner. The paper defaults
to A4 portrait, and unspecified gaps and margins default to zero.

```yaml
paper:
  size: A4 # A3, A4, A5, Letter, Legal, or custom
  orientation: portrait # portrait or landscape
  margin: { top: 10, right: 5, bottom: 5, left: 5 }
  # For custom paper, use size: custom and provide width and height.
labels:
  width: 65
  height: 34
  columns: 3
  rows: 8
  gapX: 0
  gapY: 0
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

`paper.margin` describes the physical area outside the sticker grid on each
side of the oriented page. Each omitted side defaults to zero, so marginless
paper needs no margin object. Margins affect grid placement and available
paper space. `labels.margin` remains supported as a deprecated alias; supplying
both is an error. Sticker printable-area insets remain in `labels.safety`.

### Creating a centered layout

Use `createTemplateLayout(paper, labelSize, layout)` to calculate symmetric
paper margins and return a partial template object. All dimensions are in
millimetres; columns run across the page and rows run down it.

```ts
import { createTemplateLayout } from "hamqslprint";

const partial = createTemplateLayout(
  "A4",
  { width: 70, height: 36 },
  { columns: 3, rows: 8 }
);
// partial.paper.margin: { top: 4.5, bottom: 4.5, left: 0, right: 0 }
const template = {
  ...partial,
  fields: [
    { field: "CALL", x: 2, y: 2, width: 50, height: 7, fontSize: 14 }
  ]
};
```

The paper argument accepts a named size or a settings object such as
`{ size: "A4", orientation: "landscape" }` or
`{ size: "custom", width: 210, height: 297 }`. Orientation defaults to portrait;
custom width and height are measured before orientation is applied.
The layout accepts optional `gapX` and `gapY`, which are included in the margin
calculation. Invalid dimensions and grids that do not fit throw `TemplateError`.
The helper does not infer row/column counts, rotate labels, or add `fields`.
The host can add fields and sticker safety margins, then serialize the object
as YAML or pass it directly to the template APIs.

### Template content validation

Field box positions and dimensions must stay within the label's safety margins.
The checker verifies every contact value fits both its box and selected font's
character set. Constants are checked once; missing contact fields render as an
empty string. Contacts are placed in row-major order, with one PDF page per
label sheet.

Cabrillo and EDI QSO data are exposed using ADIF-style field names where a
corresponding value exists. Cabrillo QSO columns follow the standard frequency,
mode, date, time, sent call/report/exchange, received call/report/exchange
ordering; frequencies above 1000 are converted from kHz to ADIF MHz. EDI records
use the REG1TEST QSO record order for date, time, call, mode, reports, serials,
and contacted station locator.

EDI header values are copied to every contact:

| EDI header | ADIF field | Example |
| --- | --- | --- |
| `PCall` | `STATION_CALLSIGN` | `OK1KEO/P` |
| `PWWLo` | `MY_GRIDSQUARE` | `JN79NU` |
| `PBand` | `BAND` | `145 MHz` becomes `2m`; `435 MHz` becomes `70cm` |

Missing or blank headers are omitted. Bands accept MHz or GHz and are mapped
to ADIF VHF/UHF/microwave bands from 6m through 1mm. Unrecognized bands raise
a parsing error. EDI does not supply the actual QSO frequency, so `FREQ` is
omitted rather than inferred from the band header. Frequencies provided by
ADIF and Cabrillo logs remain available.

The PDF returned for target `"none"` works in browser and Node applications.
File-path output requires Node.js.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
```

### Testing a real log file

From the project directory, run:

```powershell
npm run test:log -- "C:\Users\jvavruska\Documents\_HAM\02_logs\2015-CQWWSSB-OK1KEO.adi"
```

This rebuilds the library, reads the supplied file, detects its format, and
prints the sorted field list as JSON. Relative paths are resolved from the
current working directory. Missing arguments, unreadable files, and parsing
errors are reported to stderr with a nonzero exit code.

Parser tests include real Cabrillo and IARU R1 EDI QSO excerpts from
[df7cb/df7cb-log](https://github.com/df7cb/df7cb-log). `selectFields` was also
run against a public 253-record ADIF export from
[qso-mapper](https://github.com/stephenhouser/qso-mapper), returning 55
distinct fields.
