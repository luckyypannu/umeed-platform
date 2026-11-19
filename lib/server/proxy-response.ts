export function proxyResponseBody(status: number, body: ArrayBuffer): ArrayBuffer | null {
  return [204, 205, 304].includes(status) ? null : body
}
