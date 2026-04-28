export const HARDENING_HEADERS = Object.freeze([
  Object.freeze({
    key: "X-Content-Type-Options",
    value: "nosniff"
  }),
  Object.freeze({
    key: "X-Frame-Options",
    value: "DENY"
  }),
  Object.freeze({
    key: "Referrer-Policy",
    value: "no-referrer"
  })
]);

export function buildHeaderMap(headers = []) {
  return Object.fromEntries(headers.map((header) => [header.key, header.value]));
}
