import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtmlPath = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(indexHtmlPath, "utf8");

function getInputMarkup(id) {
  const idIndex = html.indexOf(`id="${id}"`);
  assert.notEqual(idIndex, -1, `Expected ${id} input to exist.`);

  const inputStart = html.lastIndexOf("<input", idIndex);
  const inputEnd = html.indexOf("/>", idIndex);
  assert.notEqual(inputStart, -1, `Expected ${id} to belong to an input.`);
  assert.notEqual(inputEnd, -1, `Expected ${id} input to be self-closing.`);

  return html.slice(inputStart, inputEnd + 2);
}

function usesDecimalTextInputsForManualAcademicEntry() {
  for (const id of ["applicationAcademicEntryCwa", "applicationAcademicEntryWassce"]) {
    const inputMarkup = getInputMarkup(id);

    assert.match(inputMarkup, /type="text"/u);
    assert.match(inputMarkup, /inputmode="decimal"/u);
    assert.doesNotMatch(inputMarkup, /type="number"/u);
    assert.doesNotMatch(inputMarkup, /step=/u);
  }
}

usesDecimalTextInputsForManualAcademicEntry();

console.log("application-academic-entry-markup-tests: ok");
