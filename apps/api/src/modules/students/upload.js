import { read, utils } from "xlsx";
import { AppError } from "../../lib/errors.js";
import { readJsonBody, readRequestBody } from "../../lib/http.js";
import {
  assertAcceptedUploadCount,
  assertSafeSpreadsheetUpload
} from "../../lib/uploadSecurity.js";

function getContentType(req) {
  return String(req.headers["content-type"] || "");
}

function extractBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match?.[1] || match?.[2] || null;
}

function normalizeHeaderName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collapseLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanProgramLabel(value) {
  return collapseLine(value).replace(/\.+$/, "").trim();
}

function normalizeYearValue(value) {
  const text = collapseLine(value).toUpperCase();
  const directMatch = text.match(/\bYEAR\s*([1-9]\d?)\b/);
  if (directMatch) return `Year ${directMatch[1]}`;

  const base = collapseLine(value);
  if (/^\d{1,2}$/.test(base)) return `Year ${base}`;
  return base;
}

function parseProgramYearLabel(text) {
  const source = collapseLine(text);
  if (!source) return null;

  const compact = source.replace(/\.+$/, "");
  const match = compact.match(/^(.*?)[,\-]?\s*(YEAR\s*\d+|GRACE PERIOD|COMPLETED)$/i);
  if (!match) return null;

  if (/studentid|name|currency|bill|fee|student name|student id/i.test(match[1])) return null;

  return {
    program: cleanProgramLabel(match[1]),
    year: normalizeYearValue(match[2])
  };
}

function isContextNoiseLine(line) {
  const text = collapseLine(line).toLowerCase();
  if (!text) return true;
  if (/^option:/.test(text)) return true;
  if (/^sn\.?\b/.test(text)) return true;
  if (/kwame nkrumah|university of science and technology/.test(text)) return true;
  if (/class list for|academic year/.test(text)) return true;
  if (/studentid|index no|surname|othername|nationality|gender|hall|hostel|signature/.test(text)) return true;
  return false;
}

function extractCollegeProgramYear(matrix, fileName, sheetName) {
  let college = "";
  let program = "";
  let year = "";
  const contextLines = [];

  for (let index = 0; index < Math.min(matrix.length, 20); index += 1) {
    const line = collapseLine((matrix[index] || []).join(" "));
    if (!line) continue;
    contextLines.push(line);

    if (!college && /^(college of|institute of)/i.test(line)) {
      college = cleanProgramLabel(line);
      continue;
    }

    const programYear = parseProgramYearLabel(line);
    if (programYear) {
      if (!program) program = programYear.program;
      if (!year) year = programYear.year;
      continue;
    }

    if (!program && contextLines.length <= 5 && !isContextNoiseLine(line)) {
      program = cleanProgramLabel(line);
    }
  }

  if (!college) {
    const combined = `${fileName} ${sheetName}`;
    const match = combined.match(/\b(CABE|CANR|CHS|COE|COHSS|COS|IDL)\b/i);
    if (match) {
      const code = match[1].toUpperCase();
      const collegeMap = {
        CABE: "College of Art and Built Environment",
        CANR: "College of Agriculture and Natural Resources",
        CHS: "College of Health Sciences",
        COE: "College of Engineering",
        COHSS: "College of Humanities and Social Sciences",
        COS: "College of Science",
        IDL: "Institute of Distance Learning"
      };
      college = collegeMap[code] || code;
    }
  }

  return {
    college,
    program,
    year
  };
}

function parseMultipartHeaders(headerBlock) {
  const headers = {};
  for (const line of headerBlock.split("\r\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[name] = value;
  }

  return headers;
}

function parseDisposition(value) {
  const output = {};
  for (const segment of String(value || "").split(";")) {
    const [rawKey, rawValue] = segment.split("=");
    const key = rawKey?.trim().toLowerCase();
    if (!key) continue;

    if (rawValue === undefined) {
      output[key] = true;
      continue;
    }

    output[key] = rawValue.trim().replace(/^"|"$/g, "");
  }

  return output;
}

function parseMultipart(buffer, contentType) {
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    throw new AppError(400, "Multipart requests must include a boundary.");
  }

  const boundaryToken = `--${boundary}`;
  const raw = buffer.toString("latin1");
  const segments = raw.split(boundaryToken).slice(1, -1);
  const parts = [];

  for (const segment of segments) {
    const trimmed = segment.replace(/^\r\n/, "").replace(/\r\n$/, "");
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf("\r\n\r\n");
    if (separatorIndex === -1) continue;

    const headerBlock = trimmed.slice(0, separatorIndex);
    const bodyBlock = trimmed.slice(separatorIndex + 4);
    const headers = parseMultipartHeaders(headerBlock);
    const disposition = parseDisposition(headers["content-disposition"]);
    const body = Buffer.from(bodyBlock, "latin1");

    parts.push({
      headers,
      disposition,
      name: disposition.name || null,
      filename: disposition.filename || null,
      body,
      value: disposition.filename ? null : body.toString("utf8")
    });
  }

  return parts;
}

function detectHeaderRowIndex(matrix) {
  let best = { index: -1, score: 0 };
  const keywords = ["studentid", "indexno", "surname", "othername", "gender", "name"];

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 30); rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    let score = 0;

    for (const cell of row) {
      const normalized = normalizeHeaderName(cell);
      for (const keyword of keywords) {
        if (normalized === keyword || normalized.includes(keyword)) {
          score += 1;
        }
      }
    }

    if (score > best.score) {
      best = { index: rowIndex, score };
    }
  }

  return best.score >= 2 ? best.index : -1;
}

function buildFullName(surname, otherName, fallback = "") {
  const parts = [collapseLine(surname), collapseLine(otherName)].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return collapseLine(fallback);
}

function mapClassListRowsFromSheet(sheet, sheetName, fileName) {
  const matrix = utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });

  if (!matrix.length) return [];

  const headerRowIndex = detectHeaderRowIndex(matrix);
  if (headerRowIndex === -1) return [];

  const headers = matrix[headerRowIndex] || [];
  const normalizedHeaders = headers.map((value) => normalizeHeaderName(value));
  const context = extractCollegeProgramYear(matrix, fileName, sheetName);
  const rows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = (matrix[rowIndex] || []).map((value) => String(value ?? "").trim());
    if (row.every((value) => !value)) continue;

    const joined = collapseLine(row.join(" "));
    if (!joined || /^option:/i.test(joined)) continue;

    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));

    const getValue = (...aliases) => {
      for (const alias of aliases) {
        const target = normalizeHeaderName(alias);
        const exactIndex = normalizedHeaders.findIndex((header) => header === target || header.includes(target));
        if (exactIndex !== -1) {
          return collapseLine(row[exactIndex]);
        }
      }
      return "";
    };

    const studentReferenceId = getValue("studentid", "student id", "reference number");
    const indexNumber = getValue("indexno", "index number", "index no");
    const surname = getValue("surname", "last name");
    const otherName = getValue("othername", "other name", "firstname", "first name");
    const fullName = buildFullName(surname, otherName, getValue("fullname", "full name", "name"));

    if (!studentReferenceId && !fullName) continue;

    rows.push({
      "Full Name": fullName,
      "Student ID": studentReferenceId,
      "Index Number": indexNumber,
      College: context.college,
      "Programme of Study": context.program,
      Year: context.year,
      Gender: getValue("gender"),
      Notes: `${fileName} / ${sheetName}`
    });
  }

  return rows;
}

function sheetRowsFromWorkbook(buffer, fileName) {
  const workbook = read(buffer, {
    type: "buffer",
    raw: false,
    dense: true
  });

  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    rows.push(...mapClassListRowsFromSheet(sheet, sheetName, fileName));
  }

  if (rows.length === 0) {
    throw new AppError(400, `The uploaded workbook ${fileName} does not contain recognizable class-list rows.`);
  }

  return rows;
}

function rowsFromCsvFile(file) {
  const workbook = read(file.body, { type: "buffer", raw: false, dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet, { defval: "", raw: false });
  return {
    fileName: file.filename,
    fileType: "csv",
    rows
  };
}

function rowsFromUploadedFile(file) {
  const { extension, fileName } = assertSafeSpreadsheetUpload(file, "student imports");

  if (fileName.startsWith("~$")) {
    return null;
  }

  if (extension === ".csv") {
    return {
      ...rowsFromCsvFile(file),
      fileName
    };
  }

  return {
    fileName,
    fileType: "xlsx",
    rows: sheetRowsFromWorkbook(file.body, fileName)
  };
}

function mergeUploadResults(results) {
  const validResults = results.filter(Boolean);
  const rows = validResults.flatMap((result) => result.rows);

  if (!rows.length) {
    throw new AppError(400, "No importable student rows were found in the uploaded files.");
  }

  return {
    fileName: validResults.map((result) => result.fileName).join(", "),
    fileType: validResults.length > 1 ? "multi-xlsx" : validResults[0].fileType,
    rows
  };
}

export async function resolveStudentImportPayload(req, maxBytes) {
  const contentType = getContentType(req);
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes("application/json")) {
    const payload = await readJsonBody(req, maxBytes);
    return {
      source: "json",
      fileName: payload.fileName || null,
      fileType: "json",
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      resolutions: payload.resolutions || {},
      importMode: payload.importMode || "strict_new_only"
    };
  }

  if (normalizedContentType.includes("multipart/form-data")) {
    const body = await readRequestBody(req, maxBytes);
    const parts = parseMultipart(body, contentType);
    const files = parts.filter((part) => part.filename && (part.name === "file" || part.name === "files"));
    const resolutionPart = parts.find((part) => !part.filename && part.name === "resolutions");
    const importModePart = parts.find((part) => !part.filename && part.name === "importMode");

    if (!files.length) {
      throw new AppError(400, "Multipart student imports must include one or more file fields.");
    }
    assertAcceptedUploadCount(files, "Student import");

    let resolutions = {};
    if (resolutionPart?.value?.trim()) {
      try {
        resolutions = JSON.parse(resolutionPart.value);
      } catch {
        throw new AppError(400, "The duplicate resolution payload must be valid JSON.");
      }
    }

    return {
      source: "upload",
      ...mergeUploadResults(files.map(rowsFromUploadedFile)),
      resolutions,
      importMode: importModePart?.value?.trim() || "strict_new_only"
    };
  }

  throw new AppError(
    415,
    "Student import requests must use application/json or multipart/form-data."
  );
}
