/** Language detection shared by chat, voice and reminders. Pure, safe on client and server. */

/** Clearly Hindi/Marathi words that never show up in normal English. One is enough. */
const HINDI_STRONG =
  /\b(hai|hain|nahi|nai|kya|yaar|mtlb|matlab|pkka|pakka|rha|rhi|raha|rahi|jevlis|khup|jaast|meko|mujhe|mujhko|tula|mala|krna|karna|abhi|bje|baje|theek|mene|maine|boht|bahut|zop|sangto|barobar|tum|aur|kuch|pdega|padega|baadme|dhyaan|rkh|rakh|bhai|kitna|kaise|kaisa|kyu|kyun|accha|acha|haan|chal|chalo|bata|batao|dekh|sach|bas|kal|aaj|mera|meri|tera|teri|apna|wala|wali|hoon|hu)\b/i;
/** Short words that are also English ("he", "na", "ki"...): only count when several show up together. */
const HINDI_WEAK = /\b(he|bhi|bs|ka|ke|ki|na|kr|kar|bol|kb|fir|ae|tu|tha|thi|aik)\b/gi;

/** Is this message Hinglish? Devanagari, or a clearly Hindi word, or 2+ of the ambiguous ones. */
export function isHinglish(text: string) {
  if (/[ऀ-ॿ]/.test(text)) return true;
  if (HINDI_STRONG.test(text)) return true;
  return new Set((text.match(HINDI_WEAK) ?? []).map((w) => w.toLowerCase())).size >= 2;
}
