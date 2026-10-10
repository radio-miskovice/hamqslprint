# PROJECT SETUP

## 1. Project setup and tooling

- language is typescript
- use vite and vitest
- target is npm module

## 2. PURPOSE

The purpose of the project is to accept ham radio log file (ADIF, Cabrillo, IARU R1 EDI VHF contest log).

### 2.1 Inputs

- log file (ADIF, Cabrillo, EDI)
- template definition in YAML format

### 2.2 Output

PDF file

## 3. Template definition

- paper size and orientation (default A4 portrait)
- sticker size and layout (e.g. 3 columns 8 rows, 70x36 mm )
- paper margins (physical areas out of stickers): top, bottom, left, right
- sticker safety margins (printable area is inside)
- field positions, size, font; field names by ADIF standard
- constant text and positions

## 4. API functions

### 4.1 Select fields

- input: log file
- output: list of ADIF fields found in the log file

### 4.2 Check template

Check the data and the template and either report it is OK or report problems found: text not fitting, 
selected font cannot render some characters (default data encoding is UTF-8) 

- input: log file, template
- output: information whether all log file content defined in the template fits into the print area
- output: list of errors (where text does not fit the intended template)

### 4.3 Generate PDF

- input: log file, template, target (file path or "none")
- output: if target is "none", return PDF content as binary data and the calling app is responsible 
  for saving or other transfer of the result; if it is file path, save the PDF file 

## 5. OTHER

The module can be used in a standalone app as well as in web app.