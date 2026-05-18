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

function collapseLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeaderName(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanProgramLabel(value) {
  return collapseLine(value)
    .replace(/\s*\(\s*\d+\s+students?\s*\)\s*$/i, "")
    .replace(/\.+$/, "")
    .trim();
}

function findColumn(normalized, aliases = []) {
  return normalized.findIndex((value) =>
    aliases.some((alias) => value === alias || value.includes(alias))
  );
}

function extractAcademicYearLabel(text) {
  const match = String(text || "").match(/\b(20\d{2}\/20\d{2})\b/);
  return match ? match[1] : null;
}

function extractCollegeContext(fileName, lines) {
  const collegeLabels = [
    "College of Art and Built Environment",
    "College of Agriculture and Natural Resources",
    "College of Health Sciences",
    "College of Humanities and Social Sciences",
    "College of Engineering",
    "College of Science",
    "Institute of Distance Learning"
  ];
  const combinedText = [fileName, ...lines].join(" ");

  for (const label of collegeLabels) {
    if (combinedText.toLowerCase().includes(label.toLowerCase())) {
      return label;
    }
  }

  for (const line of lines) {
    if (/^(college of|institute of)/i.test(line)) {
      return cleanProgramLabel(line);
    }

    const embeddedMatch = line.match(
      /\b((?:college|institute) of .+?)(?:\s+undergraduate|\s+postgraduate|\s+students with|\s+with cwa|$)/i
    );
    if (embeddedMatch) {
      return cleanProgramLabel(embeddedMatch[1]);
    }
  }

  const combined = combinedText.toUpperCase();
  const match = combined.match(/\b(CABE|CANR|CHS|COE|COHSS|COS|IDL)\b/);
  if (!match) {
    return "";
  }

  return {
    CABE: "College of Art and Built Environment",
    CANR: "College of Agriculture and Natural Resources",
    CHS: "College of Health Sciences",
    COE: "College of Engineering",
    COHSS: "College of Humanities and Social Sciences",
    COS: "College of Science",
    IDL: "Institute of Distance Learning"
  }[match[1]] || match[1];
}

function extractYearContext(fileName) {
  const match = String(fileName || "").match(/\bYear\s*([1-9]\d*)\b/i);
  return match ? `Year ${match[1]}` : "";
}

function extractProgramContext(lines) {
  for (const rawLine of lines) {
    const line = collapseLine(rawLine);
    if (!line) continue;
    if (/^(kwame nkrumah university|college of|institute of|faculty of|department of)/i.test(line)) continue;
    if (/final results for the academic year/i.test(line)) break;
    if (/^the following/i.test(line)) continue;
    if (/^(sn|studentid|student id|index no|name|gender|cwa)\b/i.test(line)) continue;
    if (/student\s*id/i.test(line) && /index\s*no/i.test(line) && /\bcwa\b/i.test(line)) continue;
    if (/\b\d{4,}\b.*\b\d{2,}(?:\.\d+)?$/.test(line)) continue;

    const programHeading = line.match(/^(.+?)\s*\(\s*\d+\s+students?\s*\)$/i);
    if (programHeading) {
      return cleanProgramLabel(programHeading[1]);
    }

    if (/\b(b\.?\s?sc|b\.?\s?a|b\.?\s?ed|bba|llb|msc|m\.?\s?phil|phd|diploma|certificate)\b/i.test(line)) {
      return cleanProgramLabel(line);
    }
  }

  return "";
}

function detectCwaHeader(row) {
  const normalized = (row || []).map((value) => normalizeHeaderName(value));
  const studentReferenceColumn = findColumn(normalized, [
    "studentid",
    "studentreferenceid",
    "referencenumber",
    "referenceno",
    "refno"
  ]);
  const indexNumberColumn = findColumn(normalized, ["indexno", "indexnumber"]);
  const fullNameColumn = findColumn(normalized, ["name", "fullname", "studentname"]);
  const programColumn = findColumn(normalized, ["programmeofstudy", "programofstudy", "programme", "program"]);
  const yearColumn = findColumn(normalized, ["currentyear", "year", "level"]);
  const cwaColumn = findColumn(normalized, ["cwa"]);

  if (
    (studentReferenceColumn === -1 && indexNumberColumn === -1) ||
    fullNameColumn === -1 ||
    cwaColumn === -1
  ) {
    return null;
  }

  return {
    studentReferenceColumn,
    indexNumberColumn,
    fullNameColumn,
    programColumn,
    yearColumn,
    cwaColumn
  };
}

function mapCwaRowsFromSheet(sheet, sheetName, fileName, context = {}) {
  const matrix = utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });

  if (!matrix.length) {
    return [];
  }

  const firstLines = matrix
    .slice(0, 12)
    .map((row) => collapseLine((row || []).join(" ")))
    .filter(Boolean);

  const college = extractCollegeContext(fileName, firstLines);
  const program = extractProgramContext(firstLines);
  const year = extractYearContext(fileName);
  const academicYearLabel =
    firstLines.map(extractAcademicYearLabel).find(Boolean) || context.academicYearLabel || null;
  const semesterLabel = context.semesterLabel || "Final Results";

  const rows = [];
  let header = null;

  for (const rawRow of matrix) {
    const row = (rawRow || []).map((value) => String(value ?? "").trim());
    if (row.every((value) => !value)) {
      continue;
    }

    const detectedHeader = detectCwaHeader(row);
    if (detectedHeader) {
      header = detectedHeader;
      continue;
    }

    if (!header) {
      continue;
    }

    const studentReferenceId =
      header.studentReferenceColumn === -1
        ? ""
        : collapseLine(row[header.studentReferenceColumn]);
    const indexNumber =
      header.indexNumberColumn === -1 ? "" : collapseLine(row[header.indexNumberColumn]);
    const fullName = collapseLine(row[header.fullNameColumn]);
    const rowProgram =
      header.programColumn === -1 ? "" : cleanProgramLabel(row[header.programColumn]);
    const rowYear =
      header.yearColumn === -1 ? "" : collapseLine(row[header.yearColumn]);
    const cwa = collapseLine(row[header.cwaColumn]);

    if (!indexNumber && !fullName) {
      continue;
    }

    if (/^(first class|second class|pass list|the following|sn)$/i.test(fullName)) {
      continue;
    }

    rows.push({
      "Reference Number": studentReferenceId,
      "Index Number": indexNumber,
      "Full Name": fullName,
      CWA: cwa,
      "Academic Year": academicYearLabel,
      "Semester Label": semesterLabel,
      College: college,
      "Programme of Study": rowProgram || program,
      Year: rowYear || year,
      Notes: `${fileName} / ${sheetName}`
    });
  }

  return rows;
}

function rowsFromWorkbookFile(file, context) {
  const { fileName } = assertSafeSpreadsheetUpload(file, "academic history imports");
  const workbook = read(file.body, { type: "buffer", raw: false, dense: true });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    rows.push(
      ...mapCwaRowsFromSheet(workbook.Sheets[sheetName], sheetName, fileName, context)
    );
  }

  if (!rows.length) {
    throw new AppError(
      400,
      `The uploaded workbook ${fileName} does not contain recognizable CWA rows.`
    );
  }

  return {
    fileName,
    fileType: "xlsx",
    rows
  };
}

function mergeUploadResults(results) {
  const validResults = results.filter(Boolean);
  const rows = validResults.flatMap((result) => result.rows);

  if (!rows.length) {
    throw new AppError(400, "No importable CWA rows were found in the uploaded files.");
  }

  return {
    fileName: validResults.map((result) => result.fileName).join(", "),
    fileType: validResults.length > 1 ? "multi-xlsx" : validResults[0].fileType,
    rows
  };
}

export async function resolveStudentHistoryImportPayload(req, maxBytes) {
  const contentType = getContentType(req);
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes("application/json")) {
    const payload = await readJsonBody(req, maxBytes);
    return {
      source: "json",
      fileName: payload.fileName || null,
      fileType: payload.fileType || "json",
      semesterLabel: String(payload.semesterLabel || "").trim() || "Final Results",
      academicYearLabel: String(payload.academicYearLabel || "").trim() || "",
      rows: Array.isArray(payload.rows) ? payload.rows : []
    };
  }

  if (normalizedContentType.includes("multipart/form-data")) {
    const body = await readRequestBody(req, maxBytes);
    const parts = parseMultipart(body, contentType);
    const files = parts.filter((part) => part.filename && (part.name === "file" || part.name === "files"));
    const semesterLabel =
      parts.find((part) => !part.filename && part.name === "semesterLabel")?.value?.trim() ||
      "Final Results";
    const academicYearLabel =
      parts.find((part) => !part.filename && part.name === "academicYearLabel")?.value?.trim() || "";

    if (!files.length) {
      throw new AppError(400, "Academic history imports must include one or more workbook files.");
    }
    assertAcceptedUploadCount(files, "Academic history import");

    return {
      source: "upload",
      semesterLabel,
      academicYearLabel,
      ...mergeUploadResults(
        files
          .filter((file) => !(file.filename || "").startsWith("~$"))
          .map((file) => rowsFromWorkbookFile(file, { semesterLabel, academicYearLabel }))
      )
    };
  }

  throw new AppError(
    415,
    "Academic history import requests must use application/json or multipart/form-data."
  );
}
