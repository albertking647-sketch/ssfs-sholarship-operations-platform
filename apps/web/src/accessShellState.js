import { LOGIN_PASSWORD_GUIDANCE_MESSAGE } from "./passwordVisibility.js";

function normalizeBoolean(value) {
  return value === true;
}

export function shouldAttemptSessionRestore(token) {
  return Boolean(String(token || "").trim());
}

export function buildAccessShellState({
  authenticated = false,
  sessionRestorePending = false
} = {}) {
  if (normalizeBoolean(authenticated)) {
    return {
      loginGateHidden: true,
      restoreGateHidden: true,
      loginFormHidden: false,
      appShellHidden: false,
      logoutHidden: false,
      loginMessage: "",
      loginTone: "",
      authBootMode: "authenticated"
    };
  }

  if (normalizeBoolean(sessionRestorePending)) {
    return {
      loginGateHidden: true,
      restoreGateHidden: false,
      loginFormHidden: true,
      appShellHidden: true,
      logoutHidden: true,
      loginMessage: "",
      loginTone: "",
      authBootMode: "restoring"
    };
  }

  return {
    loginGateHidden: false,
    restoreGateHidden: true,
    loginFormHidden: false,
    appShellHidden: true,
    logoutHidden: true,
    loginMessage: LOGIN_PASSWORD_GUIDANCE_MESSAGE,
    loginTone: "",
    authBootMode: "login"
  };
}
