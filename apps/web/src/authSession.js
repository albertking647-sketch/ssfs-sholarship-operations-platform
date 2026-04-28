export const AUTH_SESSION_TOKEN_KEY = "ssfs-auth-session-active";

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
  for (let index = 0; index < storages.length; index += 1) {
    const storage = storages[index];
    const token = readStoredAuthToken(storage);
    if (token) {
      if (index > 0) {
        writeStoredAuthToken(storages[0], token);
        writeStoredAuthToken(storage, "");
      }
      return token;
    }
  }

  return "";
}

export function writeStoredAuthTokenToStorages(storages = [], token) {
  const normalizedToken = normalizeToken(token);
  const [primaryStorage, ...legacyStorages] = storages;

  if (primaryStorage) {
    writeStoredAuthToken(primaryStorage, normalizedToken);
  }

  for (const storage of legacyStorages) {
    writeStoredAuthToken(storage, "");
  }

  return normalizedToken;
}
