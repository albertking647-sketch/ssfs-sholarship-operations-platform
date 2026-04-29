import assert from "node:assert/strict";

import {
  LOGIN_PASSWORD_GUIDANCE_MESSAGE,
  PASSWORD_COMPLEXITY_MESSAGE,
  setPasswordVisibility,
  togglePasswordVisibility
} from "../src/passwordVisibility.js";

function togglesPasswordFieldVisibilityAndLabel() {
  const input = {
    type: "password"
  };
  const button = {
    textContent: "",
    ariaLabel: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };

  setPasswordVisibility(input, button, false);
  assert.equal(input.type, "password");
  assert.equal(button.textContent, "Show");
  assert.equal(button.attributes["aria-pressed"], "false");

  togglePasswordVisibility(input, button);
  assert.equal(input.type, "text");
  assert.equal(button.textContent, "Hide");
  assert.equal(button.attributes["aria-pressed"], "true");
}

function exposesLoginGuidanceWithPasswordRule() {
  assert.equal(
    LOGIN_PASSWORD_GUIDANCE_MESSAGE,
    `Enter your username and password to continue. ${PASSWORD_COMPLEXITY_MESSAGE}`
  );
}

togglesPasswordFieldVisibilityAndLabel();
exposesLoginGuidanceWithPasswordRule();

console.log("password-visibility-tests: ok");
