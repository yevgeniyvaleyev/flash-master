/** Topic colors: mid-tone hues readable on both the light and the dark theme. */
export const TOPIC_COLORS = [
  '#4C6EF5', // indigo
  '#12B886', // teal
  '#F76707', // orange
  '#AE3EC9', // grape
  '#E64980', // pink
  '#1C7ED6', // blue
  '#74B816', // lime
  '#F59F00', // yellow
  '#7950F2', // violet
  '#E03131', // red
  '#0CA678', // green
  '#868E96', // gray
] as const;

/** First palette color not used yet (cycling when all are taken). */
export function nextTopicColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toUpperCase()));
  return TOPIC_COLORS.find((c) => !taken.has(c)) ?? TOPIC_COLORS[used.length % TOPIC_COLORS.length];
}

/** Fallback for a topic without a stored color. */
export const colorForId = (id: number) => TOPIC_COLORS[(Math.max(1, id) - 1) % TOPIC_COLORS.length];
