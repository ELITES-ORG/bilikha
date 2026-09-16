export interface MessageDraft {
  message: string;
}

function key(profileSlug: string) {
  return `bilikha:inquiry-draft:${profileSlug}`;
}

export function loadMessageDraft(profileSlug: string): MessageDraft | null {
  try {
    const raw = localStorage.getItem(key(profileSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.message !== 'string') return null;
    return { message: parsed.message };
  } catch {
    return null;
  }
}

export function saveMessageDraft(profileSlug: string, draft: MessageDraft): void {
  try {
    localStorage.setItem(key(profileSlug), JSON.stringify(draft));
  } catch {
    // Quota / private mode — lose the draft rather than crash the flow.
  }
}

export function clearMessageDraft(profileSlug: string): void {
  try {
    localStorage.removeItem(key(profileSlug));
  } catch {
    // ignore
  }
}
