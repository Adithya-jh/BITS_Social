const TOPIC_DICTIONARY: Record<string, string[]> = {
  travel: [
    "travel",
    "trip",
    "vacation",
    "journey",
    "flight",
    "hotel",
    "beach",
    "tour",
    "wander",
  ],
  career: [
    "job",
    "offer",
    "career",
    "promotion",
    "interview",
    "hiring",
    "work",
    "resume",
  ],
  tech: [
    "tech",
    "technology",
    "software",
    "startup",
    "programming",
    "developer",
    "ai",
    "ml",
    "app",
    "product",
  ],
  sports: [
    "match",
    "game",
    "tournament",
    "goal",
    "team",
    "sport",
    "win",
    "league",
    "cricket",
    "football",
  ],
  food: [
    "food",
    "recipe",
    "cook",
    "meal",
    "dinner",
    "breakfast",
    "lunch",
    "restaurant",
    "coffee",
  ],
  wellness: [
    "health",
    "wellness",
    "gym",
    "workout",
    "mental",
    "yoga",
    "sleep",
    "meditation",
  ],
  finance: [
    "invest",
    "stock",
    "crypto",
    "finance",
    "budget",
    "savings",
    "market",
  ],
  education: [
    "study",
    "class",
    "exam",
    "research",
    "project",
    "lecture",
    "assignment",
  ],
  entertainment: [
    "movie",
    "music",
    "concert",
    "series",
    "show",
    "song",
    "album",
  ],
};

export function deriveTopics(text?: string | null) {
  if (!text) return [];
  const normalized = text.toLowerCase();
  const topics = new Set<string>();

  Object.entries(TOPIC_DICTIONARY).forEach(([topic, terms]) => {
    if (terms.some((term) => normalized.includes(term))) {
      topics.add(topic);
    }
  });

  const hashtagRegex = /#(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = hashtagRegex.exec(text))) {
    const tag = match[1].toLowerCase();
    Object.entries(TOPIC_DICTIONARY).forEach(([topic, terms]) => {
      if (terms.includes(tag) || tag.startsWith(topic)) {
        topics.add(topic);
      }
    });
  }

  return Array.from(topics);
}

export { TOPIC_DICTIONARY };
