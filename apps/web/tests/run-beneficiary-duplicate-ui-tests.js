import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appSource = readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8");
const htmlSource = readFileSync(path.resolve(__dirname, "../index.html"), "utf8");

function duplicateSupportsTabExistsWithBadge() {
  assert.match(htmlSource, /data-beneficiary-section="duplicates"/u);
  assert.match(htmlSource, /Duplicates &amp; Declinations/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateTabBadge"/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateSelectAll"/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateBulkRequestButton"/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateBulkAllowButton"/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateDeclinationMessagingPanel"/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateDeclinationSubject"/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateDeclinationBody"/u);
  assert.match(appSource, /beneficiaryDuplicateContactOverrides/u);
  assert.match(appSource, /data-beneficiary-duplicate-contact-email/u);
  assert.match(appSource, /data-beneficiary-duplicate-contact-phone/u);
  assert.match(htmlSource, /id="beneficiaryDuplicateList"/u);
}

function duplicateSupportsActionsAreWired() {
  assert.match(appSource, /function loadBeneficiaryDuplicates/u);
  assert.match(appSource, /function allowBeneficiaryDuplicateGroups/u);
  assert.match(appSource, /function requestBeneficiaryDuplicateDeclinations/u);
  assert.match(appSource, /function openBeneficiaryDuplicateDeclinationMessaging/u);
  assert.match(appSource, /function renderBeneficiaryDuplicateDeclinationMessaging/u);
  assert.match(appSource, /function getBeneficiaryDuplicateContactOverride/u);
  assert.match(appSource, /function confirmBeneficiaryDuplicateDeclination/u);
  assert.match(appSource, /data-beneficiary-duplicate-maintained-schemes/u);
  assert.match(appSource, /data-beneficiary-duplicate-declination-warning/u);
  assert.match(appSource, /data-beneficiary-duplicate-confirm-check/u);
  assert.match(appSource, /data-beneficiary-duplicate-confirm/u);
  assert.match(appSource, /confirmed:\s*true/u);
  assert.match(appSource, /data-beneficiary-duplicate-select/u);
  assert.match(appSource, /beneficiaryDuplicateSelectAll/u);
}

function bulkInterviewDefaultsVisibleForAdmins() {
  assert.match(appSource, /applicationBulkInterviewHidden:\s*false/u);
  assert.match(appSource, /safeLocalStorageRemove\(APPLICATION_BULK_INTERVIEW_HIDDEN_KEY\)/u);
  assert.match(appSource, /bulkInterviewPanel\.hidden = !isAdmin/u);
}

duplicateSupportsTabExistsWithBadge();
duplicateSupportsActionsAreWired();
bulkInterviewDefaultsVisibleForAdmins();

console.log("beneficiary-duplicate-ui-tests: ok");
