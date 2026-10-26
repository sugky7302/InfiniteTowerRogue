/** 保守上限；精確原生上限仍待 WC3 遊戲內驗證。 */
export const MAX_SYNC_DATA_BYTES = 240;
export const MAX_SYNC_PREFIX_BYTES = 32;

declare const string: { len(this: void, value: string): number };

/** Lua 字串是位元組；Node 字串是 UTF-16。只計算到超過資料上限。 */
export function syncDataByteLength(value: string): number {
  if (typeof string !== "undefined") return string.len(value);
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 55296 && code <= 56319 && index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 56320 && value.charCodeAt(index + 1) <= 57343) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > MAX_SYNC_DATA_BYTES) return bytes;
  }
  return bytes;
}

export function validSyncPrefix(prefix: string): boolean {
  if (prefix.length < 1 || prefix.length > MAX_SYNC_PREFIX_BYTES) return false;
  for (let index = 0; index < prefix.length; index++) {
    const code = prefix.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) || code === 95 || code === 45 || code === 46)) return false;
  }
  return true;
}

export function validSyncData(data: string): boolean {
  return data.indexOf("\0") === -1 && syncDataByteLength(data) <= MAX_SYNC_DATA_BYTES;
}
