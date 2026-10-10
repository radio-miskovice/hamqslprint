import {
  supportedLogFormats,
  type LogInput,
  type LogRecord,
  type ParsedLog,
  type SupportedLogFormat
} from "./types";

const decoder = new TextDecoder("utf-8", { fatal: true });

function asText(input: LogInput): string {
  try {
    return typeof input === "string" ? input : decoder.decode(input);
  } catch (error) {
    throw new Error("Log data must be valid UTF-8.", { cause: error });
  }
}

function detectFormat(text: string): SupportedLogFormat {
  if (/<\s*(?:EOH|EOR)\s*>/i.test(text)) return "adif";
  if (/^\s*\[REG1TEST\s*;/im.test(text)) return "edi";
  if (/^\s*(?:START-OF-LOG:|QSO:)/im.test(text)) return "cabrillo";
  throw new Error("Unable to detect log format; specify format explicitly.");
}

function parseAdif(text: string): LogRecord[] {
  const bytes = new TextEncoder().encode(text);
  const records: LogRecord[] = [];
  let record: LogRecord = {};
  let position = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  let inHeader = false;
  const firstTag = findByte(bytes, 60, position);
  if (firstTag >= 0) {
    const close = findByte(bytes, 62, firstTag + 1);
    if (close >= 0 && /^(?:ADIF|PROGRAMID|CREATED_TIMESTAMP)$/i.test(ascii(bytes, firstTag + 1, close))) {
      inHeader = true;
    }
  }

  while (position < bytes.length) {
    const open = findByte(bytes, 60, position);
    if (open < 0) break;
    const close = findByte(bytes, 62, open + 1);
    if (close < 0) throw new Error("Malformed ADIF tag: missing closing '>'.");
    const tag = ascii(bytes, open + 1, close).trim();
    position = close + 1;
    if (/^EOH$/i.test(tag)) {
      inHeader = false;
      record = {};
      continue;
    }
    if (/^EOR$/i.test(tag)) {
      if (!inHeader && Object.keys(record).length > 0) records.push(record);
      record = {};
      inHeader = false;
      continue;
    }

    const match = /^([A-Z0-9_]+):(\d+)(?::[^>]*)?$/i.exec(tag);
    if (!match) continue;
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || position + length > bytes.length) {
      throw new Error(`Invalid byte length for ADIF field ${match[1]}.`);
    }
    const name = match[1].toUpperCase();
    const value = decoder.decode(bytes.subarray(position, position + length));
    position += length;
    if (!inHeader) record[name] = value;
  }

  return records;
}

function parseCabrillo(text: string): LogRecord[] {
  const records: LogRecord[] = [];
  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!/^QSO\s*:/i.test(line)) continue;
    const tokens = line.replace(/^QSO\s*:\s*/i, "").trim().split(/\s+/);
    if (tokens.length < 9) {
      throw new Error(`Malformed Cabrillo QSO record on line ${lineIndex + 1}.`);
    }

    const record: LogRecord = {
      FREQ: normalizeFrequency(tokens[0]),
      MODE: cabrilloMode(tokens[1]),
      QSO_DATE: normalizeDate(tokens[2]),
      TIME_ON: normalizeTime(tokens[3]),
      CALL: tokens[7],
      RST_SENT: tokens[5],
      STX_STRING: tokens[6],
      RST_RCVD: tokens[8]
    };
    if (tokens.length > 9) record.SRX_STRING = tokens.slice(9).join(" ");
    records.push(record);
  }
  return records;
}

function parseEdi(text: string): LogRecord[] {
  const records: LogRecord[] = [];
  let readingQsos = false;
  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (/^\[QSORecords(?:;|\])/i.test(line)) {
      readingQsos = true;
      continue;
    }
    if (line.startsWith("[") && readingQsos) readingQsos = false;
    if (!readingQsos || !line || line.startsWith("#")) continue;

    const columns = line.split(";").map((value) => value.trim());
    if (columns.length < 9) {
      throw new Error(`Malformed EDI QSO record on line ${lineIndex + 1}.`);
    }
    const record: LogRecord = {
      QSO_DATE: normalizeDate(columns[0]),
      TIME_ON: normalizeTime(columns[1]),
      CALL: columns[2],
      RST_SENT: columns[4],
      STX_STRING: columns[5],
      RST_RCVD: columns[6],
      SRX_STRING: columns[7],
      GRIDSQUARE: columns[8]
    };
    if (columns[3]) record.MODE = cabrilloMode(columns[3]);
    if (columns[9]) record.FREQ = columns[9];
    records.push(record);
  }
  return records;
}

function findByte(bytes: Uint8Array, value: number, from: number): number {
  for (let index = from; index < bytes.length; index++) {
    if (bytes[index] === value) return index;
  }
  return -1;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let result = "";
  for (let index = start; index < end; index++) result += String.fromCharCode(bytes[index]);
  return result;
}

function normalizeDate(value: string): string {
  const compact = value.replace(/-/g, "");
  return compact.length === 6 ? `20${compact}` : compact;
}

function normalizeTime(value: string): string {
  return value.replace(/:/g, "");
}

function cabrilloMode(value: string): string {
  switch (value.toUpperCase()) {
    case "PH":
      return "SSB";
    case "RY":
      return "RTTY";
    default:
      return value.toUpperCase();
  }
}

function normalizeFrequency(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 1000 ? String(numeric / 1000) : value;
}

export function parseLog(input: LogInput, format?: SupportedLogFormat): ParsedLog {
  const text = asText(input);
  const selectedFormat = format ?? detectFormat(text);
  if (!supportedLogFormats.includes(selectedFormat)) {
    throw new Error(`Unsupported log format: ${String(selectedFormat)}.`);
  }
  const records =
    selectedFormat === "adif"
      ? parseAdif(text)
      : selectedFormat === "cabrillo"
        ? parseCabrillo(text)
        : parseEdi(text);
  return { format: selectedFormat, records };
}

export function selectFields(input: LogInput, format?: SupportedLogFormat): string[] {
  const fields = new Set<string>();
  for (const record of parseLog(input, format).records) {
    for (const field of Object.keys(record)) fields.add(field);
  }
  return [...fields].sort();
}
