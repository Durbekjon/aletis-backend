function startsWith(buf: Buffer, signature: number[]): boolean {
  if (buf.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buf[i] !== signature[i]) return false;
  }
  return true;
}

function matchAt(buf: Buffer, offset: number, signature: number[]): boolean {
  if (buf.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buf[offset + i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Verify that the first bytes of `buf` actually match the declared MIME type,
 * defeating "rename the .exe to .png" tricks. The MIME header from the client
 * is not trusted.
 */
export function bufferMatchesMime(buf: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/gif':
      return (
        startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWith(buf, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
      );
    case 'image/webp':
      // RIFF....WEBP
      return (
        startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
        matchAt(buf, 8, [0x57, 0x45, 0x42, 0x50])
      );
    default:
      return false;
  }
}
