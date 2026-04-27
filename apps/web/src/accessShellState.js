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
      loginFormHidden: false,
      appShellHidden: false,
      logoutHidden: false,
      loginMessage: "",
      loginTone: ""
    };
  }

  if (normalizeBoolean(sessionRestorePending)) {
    return {
      loginGateHidden: false,
      loginFormHidden: true,
      appShellHidden: true,
      logoutHidden: true,
      loginMessage: "Restoring your previous sign-in...",
      loginTone: "warning"
    };
  }

  return {
    loginGateHidden: false,
    loginFormHidden: false,
    appShellHidden: true,
    logoutHidden: true,
    loginMessage: "",
    loginTone: ""
  };
}
