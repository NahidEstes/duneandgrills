const WORDS_PER_MINUTE = 225;

export const calculateReadingTime = (content = "") => {
  const readableText = String(content)
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_>`~\[\](){}|]/g, " ")
    .trim();

  const wordCount = readableText
    ? readableText.split(/\s+/u).filter(Boolean).length
    : 0;

  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
};
