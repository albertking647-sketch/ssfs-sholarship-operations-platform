export const AUTH_SESSION_TOKEN_KEY = "ssfs-auth-session-token";

function normalizeToken(token) {
  return String(token || "").trim();
}

export function readStoredAuthToken(storage) {
  try {
    return normalizeToken(storage?.getItem?.(AUTH_SESSION_TOKEN_KEY));
  } catch {
    return "";
  }
}

export function writeStoredAuthToken(storage, token) {
  const normalizedToken = normalizeToken(token);

  try {
    if (!normalizedToken) {
      storage?.removeItem?.(AUTH_SESSION_TOKEN_KEY);
      return "";
    }

    storage?.setItem?.(AUTH_SESSION_TOKEN_KEY, normalizedToken);
    return normalizedToken;
  } catch {
    return "";
  }
}

export function readStoredAuthTokenFromStorages(storages = []) {
  for (const storage of storages) {
    const token = readStoredAuthToken(storage);
    if (token) {
      return token;
    }
  }

  return "";
}

export function writeStoredAuthTokenToStorages(storages = [], token) {
  const normalizedToken = normalizeToken(token);

  for (const storage of storages) {
    writeStoredAuthToken(storage, normalizedToken);
  }

  return normalizedToken;
}
