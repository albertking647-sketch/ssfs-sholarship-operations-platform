import assert from "node:assert/strict";

import { confirmSessionAfterLogin } from "../src/sessionConfirmation.js";

async function retriesUntilAuthenticatedSessionArrives() {
  const payloads = [
    { authenticated: false, actor: null },
    { authenticated: true, actor: { username: "aking" } }
  ];
  const observedDelays = [];

  const result = await confirmSessionAfterLogin({
    fetchSession: async () => ({
      ok: true,
      payload: payloads.shift()
    }),
    retries: 2,
    retryDelayMs: 25,
    wait: async (delayMs) => {
      observedDelays.push(delayMs);
    }
  });

  assert.equal(result.authenticated, true);
  assert.deepEqual(observedDelays, [25]);
}

async function stopsRetryingAfterExhaustingAttempts() {
  let calls = 0;

  const result = await confirmSessionAfterLogin({
    fetchSession: async () => {
      calls += 1;
      return {
        ok: true,
        payload: {
          authenticated: false,
          actor: null
        }
      };
    },
    retries: 2,
    retryDelayMs: 10,
    wait: async () => {}
  });

  assert.equal(result.authenticated, false);
  assert.equal(calls, 3);
}

async function throwsWhenSessionEndpointFails() {
  await assert.rejects(
    () =>
      confirmSessionAfterLogin({
        fetchSession: async () => ({
          ok: false,
          payload: {
            message: "Unable to reach the API session endpoint."
          }
        }),
        wait: async () => {}
      }),
    /Unable to reach the API session endpoint\./u
  );
}

await retriesUntilAuthenticatedSessionArrives();
await stopsRetryingAfterExhaustingAttempts();
await throwsWhenSessionEndpointFails();

console.log("session-confirmation-tests: ok");
