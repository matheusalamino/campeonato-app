export type RegistrationBucket = "registration-photos" | "registration-docs";

/**
 * Converte a referencia guardada no banco no caminho dentro do bucket.
 *
 * Fotos ficam como URL publica; documentos ficam como "bucket/path", porque o
 * bucket e privado e o admin gera signed URL depois.
 *
 * Retorna null quando a referencia nao pertence ao bucket informado, quando
 * sobra caminho vazio, ou quando ha um segmento `..` tentando escapar do
 * bucket. A referencia chega do cliente, entao nada aqui pode ser presumido.
 */
export function storagePathFromRef(ref: string, bucket: RegistrationBucket): string | null {
  if (!ref) return null;

  let path: string | null = null;

  const marker = `/object/public/${bucket}/`;
  const markerAt = ref.indexOf(marker);
  if (markerAt !== -1) {
    path = ref.slice(markerAt + marker.length);
  } else if (ref.startsWith(`${bucket}/`)) {
    path = ref.slice(bucket.length + 1);
  }

  if (!path) return null;
  if (path.split("/").includes("..")) return null;

  return path;
}
