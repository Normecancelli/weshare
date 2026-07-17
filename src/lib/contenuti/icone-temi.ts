// Set curato di icone assegnabili a un tema (Formazione/Presentazioni).
// Unica fonte di verità: sia il picker UI sia la validazione server-side
// importano questa costante, mai una copia locale.
export const ICONE_TEMA_DISPONIBILI = [
  "GraduationCap", "Presentation", "Package", "Briefcase", "Calendar",
  "Users", "TrendingUp", "Star", "Target", "Heart", "Sparkles", "Home",
  "ShoppingCart", "Award", "Megaphone", "Handshake", "Lightbulb", "BookOpen",
  "Video", "Mic", "Globe", "DollarSign", "Rocket", "Leaf",
] as const;

export type IconaTema = (typeof ICONE_TEMA_DISPONIBILI)[number];

export const ICONA_TEMA_DEFAULT: IconaTema = "BookOpen";

export function isIconaTemaValida(value: string): value is IconaTema {
  return (ICONE_TEMA_DISPONIBILI as readonly string[]).includes(value);
}
