/** Packs text the way the server unpacks it, so a big league stays small on the wire. */
export async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}
