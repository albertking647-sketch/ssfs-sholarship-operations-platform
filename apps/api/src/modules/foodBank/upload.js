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

function collapse(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function detectHeaderRowIndex(matrix) {
  const keywords = [
    "academic year",
    "student id",
    "reference",
    "name",
    "counselor",
    "counsellor",
    "source",
    "notes"
  ];
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

  return bestScore >= 3 ? bestIndex : -1;
}

function rowsFromSheet(sheet, fileName, sheetName) {
  const matrix = utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });

  if (!matrix.length) return [];

  const headerRowIndex = detectHeaderRowIndex(matrix);
  if (headerRowIndex === -1) return [];

  const headers = (matrix[headerRowIndex] || []).map((value) => collapse(value));
  const rows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] || [];
    if (row.every((value) => !collapse(value))) continue;

    const item = {};
    headers.forEach((header, index) => {
      if (!header) return;
      item[header] = collapse(row[index]);
    });
    item.Notes = [item.Notes, fileName, sheetName].filter(Boolean).join(" / ");
    rows.push(item);
  }

  return rows;
}

function rowsFromWorkbook(buffer, fileName) {
  const workbook = read(buffer, { type: "buffer", raw: false });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    rows.push(...rowsFromSheet(workbook.Sheets[sheetName], fileName, sheetName));
  }

  if (!rows.length) {
    throw new AppError(
      400,
      `The uploaded workbook ${fileName} does not contain recognizable food-bank rows.`
    );
  }

  return rows;
}

function rowsFromUploadedFile(file) {
  const extension = path.extname(file.filename || "").toLowerCase();
  if (![".csv", ".xlsx"].includes(extension)) {
    throw new AppError(400, "Only .csv and .xlsx files are supported for food-bank imports.");
  }

  if ((file.filename || "").startsWith("~$")) {
    return null;
  }

  return {
    fileName: file.filename,
    fileType: extension === ".csv" ? "csv" : "xlsx",
    rows: rowsFromWorkbook(file.body, file.filename || "food-bank.xlsx")
  };
}

function mergeResults(results) {
  const validResults = results.filter(Boolean);
  const rows = validResults.flatMap((result) => result.rows);

  if (!rows.length) {
    throw new AppError(400, "No importable food-bank rows were found in the uploaded files.");
  }

  return {
    fileName: validResults.map((result) => result.fileName).join(", "),
    fileType: validResults.length > 1 ? "multi-file" : validResults[0].fileType,
    rows
  };
}

export async function resolveFoodBankImportPayload(req, maxBytes) {
  const contentType = getContentType(req);
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes("application/json")) {
    const payload = await readJsonBody(req, maxBytes);
    return {
      source: "json",
      fileName: payload.fileName || null,
      fileType: "json",
      rows: Array.isArray(payload.rows) ? payload.rows : []
    };
  }

  if (normalizedContentType.includes("multipart/form-data")) {
    const body = await readRequestBody(req, maxBytes);
    const parts = parseMultipart(body, contentType);
    const fileParts = parts.filter((part) => part.filename);

    if (!fileParts.length) {
      throw new AppError(400, "Select at least one food-bank file to preview or import.");
    }

    const merged = mergeResults(fileParts.map(rowsFromUploadedFile));
    return {
      source: "multipart",
      fileName: merged.fileName,
      fileType: merged.fileType,
      rows: merged.rows
    };
  }

  throw new AppError(
    415,
    "Food-bank import requests must be sent as JSON or multipart/form-data."
  );
}
