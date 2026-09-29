type SelectableTextarea = Pick<HTMLTextAreaElement, "value" | "selectionStart" | "selectionEnd">;

/** The selected text of a textarea, or its whole value if short and single-line. */
export function pickSelection(el: SelectableTextarea | null, fallback: string): string {
  if (el && el.selectionStart !== el.selectionEnd) return el.value.slice(el.selectionStart, el.selectionEnd).trim();
  const whole = fallback.trim();
  return whole && !/[\r\n\t]/.test(whole) && new TextEncoder().encode(whole).length <= 1024 ? whole : "";
}
