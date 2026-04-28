function delayFor(delayMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
  });
}

export async function confirmSessionAfterLogin({
  fetchSession,
  retries = 2,
  retryDelayMs = 150,
  wait = delayFor
} = {}) {
  const totalAttempts = Math.max(1, (Number(retries) || 0) + 1);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const result = await fetchSession();
    if (!result?.ok) {
      throw new Error(result?.payload?.message || "Unable to reach the API session endpoint.");
    }

    if (result.payload?.authenticated) {
      return result.payload;
    }

    if (attempt < totalAttempts - 1) {
      await wait(retryDelayMs);
    }
  }

  return {
    authenticated: false,
    actor: null
  };
}
