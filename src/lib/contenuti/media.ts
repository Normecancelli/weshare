const AUDIO_EXTENSIONS = ["mp3", "m4a", "wav", "ogg"];

export function isAudioFile(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.includes(ext);
}
