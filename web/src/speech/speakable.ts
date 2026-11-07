// What the voice should say, as opposed to what the page shows. Voices read dashes as "minus":
// "250–900" becomes "250 til 900", and a dash between words (" – ") becomes a short pause.
const range = /(\d)\s*[–—‒-]\s*(\d)/g;
const spacedDash = /\s+[–—‒-]+\s+/g;
const edgeDash = /^\s*[–—‒-]+\s*|\s*[–—‒-]+\s*$/g;

export function speakable(text: string): string {
  return text.replace(range, '$1 til $2').replace(spacedDash, ', ').replace(edgeDash, '').trim();
}
