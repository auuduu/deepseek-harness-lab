export function parseJsonObject<T>(text: string, label: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : extractJson(trimmed);
  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    throw new Error(`Failed to parse ${label} as JSON: ${(error as Error).message}\n${candidate.slice(0, 500)}`);
  }
}

function extractJson(text: string): string {
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}
