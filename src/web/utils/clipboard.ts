export async function copyTextToClipboard(text: string): Promise<void> {
  let clipboardError: unknown;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  if (copyTextWithTextarea(text)) return;

  if (clipboardError instanceof Error) throw clipboardError;
  throw new Error("Clipboard copy is unavailable in this browser context.");
}

function copyTextWithTextarea(text: string): boolean {
  if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];

  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
    restoreSelection(selection, ranges);
    activeElement?.focus({ preventScroll: true });
  }

  return copied;
}

function restoreSelection(selection: Selection | null, ranges: Range[]): void {
  if (!selection) return;
  selection.removeAllRanges();
  for (const range of ranges) selection.addRange(range);
}
