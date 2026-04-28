export function showLoginGateMessage({
  message,
  renderAccessShell,
  setLoginMessage,
  tone = "error"
} = {}) {
  renderAccessShell?.();
  setLoginMessage?.(message, tone);
}
