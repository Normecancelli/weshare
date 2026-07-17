// Converte un link esterno (YouTube/Drive) in URL embeddabile per iframe,
// così il player in-app non fa mai uscire l'utente dal dominio.
export function toEmbeddableUrl(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;

  return url;
}
