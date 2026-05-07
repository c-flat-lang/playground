async function compressString(source: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(source);
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  writer.write(encoded);
  writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(compressed);
}

async function decompressString(data: string): Promise<string> {
  const ds = new DecompressionStream("deflate");
  const dw = ds.writable.getWriter();
  dw.write(Uint8Array.from(data, (char) => char.charCodeAt(0)));
  dw.close();

  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

function base64Encode(u: Uint8Array): string {
  return btoa(String.fromCharCode(...u));
}

export default {
  compressString,
  decompressString,
  base64Encode,
};
