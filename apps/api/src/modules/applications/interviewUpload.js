import path from "node:path";
import { read, utils } from "xlsx";
import { AppError } from "../../lib/errors.js";
import { readJsonBody, readRequestBody } from "../../lib/http.js";

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
    headers[name] = line.slice(separatorIndex + 1).trim();
  }
  return headers;
}

function parseDisposition(value) {
  const output = {};
  for (const segment of String(value || "").split(";")) {
    const [rawKey, rawValue] = segment.split("=");
    const key = rawKey?.trim().toLowerCase();
    if (!key) continue;
    output[key] = rawValue === undefined ? true : rawValue.trim().replace(/^"|"$/g, "");
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

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_./()-]+/g, " ")
    .replace(/\s+/g, " ");
}

function detectHeaderRowIndex(matrix) {
  const keywords = ["reference", "student id", "index", "interview", "score", "status", "name"];
  let bestIndex = -1;
  let bestScore = 0;

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 25); rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    let score = 0;

    for (const cell of row) {
      const normalized = normalizeHeader(cell);
      for (const keyword of keywords) {
        if (normalized.includes(keyword)) {
          score += 1;
        }
      }
    }

    if (score > bestScore) {
      bestIndex = rowIndex;
      bestScore = score;
    }
  }

  return bestScore >= 2 ? bestIndex : -1;
}

function rowsFromSheet(sheet) {
  const matrix = utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });

  if (!matrix.length) return [];

  const headerRowIndex = detectHeaderRowIndex(matrix);
  if (headerRowIndex === -1) return [];

  const headers = (matrix[headerRowIndex] || []).map((value) => String(value ?? "").trim());
  const rows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    if (row.every((value) => !String(value ?? "").trim())) continue;

    const item = {};
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      item[header] = row[columnIndex] ?? "";
    });
    rows.push(item);
  }

  return rows;
}

function rowsFromWorkbook(buffer, fileName) {
  const workbook = read(buffer, { type: "buffer", raw: false, dense: true });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    rows.push(...rowsFromSheet(workbook.Sheets[sheetName]));
  }

  if (!rows.length) {
    throw new AppError(400, `The uploaded workbook ${fileName} does not contain recognizable interview rows.`);
  }

  return rows;
}

function rowsFromCsv(file) {
  const workbook = read(file.body, { type: "buffer", raw: false, dense: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return rowsFromSheet(sheet);
}

function rowsFromUploadedFile(file) {
  const extension = path.extname(file.filename || "").toLowerCase();
  if (![".csv", ".xlsx"].includes(extension)) {
    throw new AppError(400, "Only .csv and .xlsx files are supported for interview score imports.");
  }

  if ((file.filename || "").startsWith("~$")) {
    return null;
  }

  return {
    fileName: file.filename,
    fileType: extension === ".csv" ? "csv" : "xlsx",
    rows: extension === ".csv" ? rowsFromCsv(file) : rowsFromWorkbook(file.body, file.filename || "uploaded.xlsx")
  };
}

function mergeResults(results) {
  const validResults = results.filter(Boolean);
  const rows = validResults.flatMap((result) => result.rows);

  if (!rows.length) {
    throw new AppError(400, "No importable interview rows were found in the uploaded files.");
  }

  return {
    fileName: validResults.map((result) => result.fileName).join(", "),
    fileType: validResults.length > 1 ? "multi-file" : validResults[0].fileType,
    rows
  };
}

export async function resolveInterviewImportPayload(req, maxBytes) {
  const contentType = getContentType(req);
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes("application/json")) {
    const payload = await readJsonBody(req, maxBytes);
    return {
      source: "json",
      fileName: payload.fileName || null,
      fileType: "json",
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      schemeId: payload.schemeId || "",
      cycleId: payload.cycleId || ""
    };
  }

  if (normalizedContentType.includes("multipart/form-data")) {
    const body = await readRequestBody(req, maxBytes);
    const parts = parseMultipart(body, contentType);
    const files = parts.filter((part) => part.filename && (part.name === "file" || part.name === "files"));

    if (!files.length) {
      throw new AppError(400, "Multipart interview imports must include one or more file fields.");
    }

    const getTextPart = (name) => parts.find((part) => !part.filename && part.name === name)?.value?.trim() || "";

    return {
      source: "upload",
      schemeId: getTextPart("schemeId"),
      cycleId: getTextPart("cycleId"),
      ...mergeResults(files.map(rowsFromUploadedFile))
    };
  }

  throw new AppError(415, "Interview import requests must use application/json or multipart/form-data.");
}
