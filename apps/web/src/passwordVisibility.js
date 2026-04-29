export const PASSWORD_COMPLEXITY_MESSAGE =
  "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters.";

export const LOGIN_PASSWORD_GUIDANCE_MESSAGE = `Enter your username and password to continue. ${PASSWORD_COMPLEXITY_MESSAGE}`;

export function setPasswordVisibility(input, button, visible) {
  if (!input || !button) {
    return;
  }

  const isVisible = visible === true;
  input.type = isVisible ? "text" : "password";
  button.textContent = isVisible ? "Hide" : "Show";
  button.setAttribute("aria-pressed", isVisible ? "true" : "false");
  button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
}

export function togglePasswordVisibility(input, button) {
  const shouldShow = String(input?.type || "password").toLowerCase() === "password";
  setPasswordVisibility(input, button, shouldShow);
}
