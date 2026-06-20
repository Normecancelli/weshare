// Static message templates for prospect follow-up.
// {nome} is replaced with the prospect's first name.

export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export interface WhatsappTemplate {
  id: string;
  label: string;
  body: string;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "primo_contatto",
    label: "Primo contatto",
    subject: "Piacere di conoscerti, {nome}",
    body:
      "Ciao {nome},\n\nè stato un piacere parlare con te. Come promesso ti scrivo per " +
      "restare in contatto e mandarti qualche informazione in più.\n\n" +
      "Fammi sapere quando hai qualche minuto per sentirci.\n\nUn caro saluto",
  },
  {
    id: "follow_up_settimana",
    label: "Follow-up settimana 1",
    subject: "Come va, {nome}?",
    body:
      "Ciao {nome},\n\nvolevo solo sapere come stai e se hai avuto modo di pensare " +
      "a quello di cui abbiamo parlato.\n\nSono qui per qualsiasi domanda.\n\nA presto",
  },
  {
    id: "follow_up_mese",
    label: "Follow-up mese 1",
    subject: "Un pensiero per te, {nome}",
    body:
      "Ciao {nome},\n\nè passato un po' di tempo e mi è venuto in mente di scriverti. " +
      "Se il momento è giusto, mi farebbe piacere riprendere il discorso.\n\nUn abbraccio",
  },
  {
    id: "opportunita",
    label: "Opportunità",
    subject: "Un'opportunità che potrebbe interessarti, {nome}",
    body:
      "Ciao {nome},\n\nho pensato a te per un'opportunità che secondo me " +
      "potrebbe fare al caso tuo. Ti va se ne parliamo con calma?\n\nDimmi tu quando.",
  },
];

export const WHATSAPP_TEMPLATES: WhatsappTemplate[] = [
  {
    id: "primo_contatto",
    label: "Primo contatto",
    body:
      "Ciao {nome}! È stato un piacere conoscerti 😊 Come promesso ti scrivo per " +
      "restare in contatto. Fammi sapere quando possiamo sentirci!",
  },
  {
    id: "follow_up_settimana",
    label: "Follow-up settimana 1",
    body:
      "Ciao {nome}! Come stai? Volevo sapere se hai avuto modo di pensare a " +
      "quello di cui abbiamo parlato 🙂",
  },
  {
    id: "follow_up_mese",
    label: "Follow-up mese 1",
    body:
      "Ciao {nome}! È passato un po' di tempo, mi è venuto in mente di scriverti. " +
      "Se ti va riprendiamo il discorso quando vuoi 👍",
  },
  {
    id: "opportunita",
    label: "Opportunità",
    body:
      "Ciao {nome}! Ho pensato a te per un'opportunità che credo possa interessarti. " +
      "Ti va se ne parliamo? 🚀",
  },
];

export function fillTemplate(text: string, nome: string): string {
  const firstName = nome.trim().split(/\s+/)[0] || nome;
  return text.replaceAll("{nome}", firstName);
}
