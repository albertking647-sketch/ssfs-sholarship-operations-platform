import path from "node:path";

import { AppError } from "./errors.js";

const XLSX_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];

export function assertAcceptedUploadCount(files, label, maxFiles = 12) {
  if (!Array.isArray(files) || files.length <= maxFiles) {
    return;
  }

  throw new AppError(
    400,
    `${label} uploads may include at most ${maxFiles} files per request.`
  );
}

function assertSafeFileName(fileName, label) {
  const normalized = String(fileName || "").trim();
  if (!normalized) {
    throw new AppError(400, `${label} uploads must include a file name.`);
  }

  if (normalized.length > 255 || /[\\/\0]/u.test(normalized)) {
    throw new AppError(400, `${label} uploads include an invalid file name.`);
  }

  return normalized;
}

export function assertSafeSpreadsheetUpload(file, label) {
  const fileName = assertSafeFileName(file?.filename, label);
  const extension = path.extname(fileName).toLowerCase();

  if (![".csv", ".xlsx"].includes(extension)) {
    throw new AppError(400, `Only .csv and .xlsx files are supported for ${label}.`);
  }

  const body = Buffer.isBuffer(file?.body) ? file.body : Buffer.alloc(0);
  if (body.length === 0) {
    throw new AppError(400, `${label} uploads cannot be empty.`);
  }

  if (extension === ".xlsx") {
    const header = body.subarray(0, 4);
    const matchesKnownSignature = XLSX_SIGNATURES.some((signature) => header.equals(signature));
    if (!matchesKnownSignature) {
      throw new AppError(400, `${label} .xlsx files must be valid Excel workbooks.`);
    }
  }

  if (extension === ".csv" && body.includes(0x00)) {
    throw new AppError(400, `${label} .csv files must be plain text.`);
  }

  return {
    extension,
    fileName
  };
}
