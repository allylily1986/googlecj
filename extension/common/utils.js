const encoder = new TextEncoder();

export function generateId(prefix = "note") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function now() {
  return Date.now();
}

export function sanitizeFileName(input) {
  return (input || "export")
    .replace(/[\\/?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

export function arrayBufferToBase64(input) {
  const bytes = toUint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function stringToUint8(text) {
  return encoder.encode(text);
}

export function escapeXml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer);
  }
  throw new TypeError("Cannot convert value to Uint8Array");
}

export function dataUrlToUint8(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new TypeError("Expected data URL string");
  }
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  const mimeType = match[1] || "application/octet-stream";
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mimeType, bytes };
}

export function inferImageExtension(mimeType) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}
