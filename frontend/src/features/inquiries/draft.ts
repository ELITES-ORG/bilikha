export interface InquiryDraft {
  subject: string;
  message: string;
}

function key(profileSlug: string) {
  return `bilikha:inquiry-draft:${profileSlug}`;
}

export function loadInquiryDraft(profileSlug: string): InquiryDraft | null {
  try {
    const raw = localStorage.getItem(key(profileSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InquiryDraft;
    if (typeof parsed.subject !== 'string' || typeof parsed.message !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveInquiryDraft(profileSlug: string, draft: InquiryDraft): void {
  try {
    localStorage.setItem(key(profileSlug), JSON.stringify(draft));
  } catch {
    // Quota / private mode — lose the draft rather than crash the flow.
  }
}

export function clearInquiryDraft(profileSlug: string): void {
  try {
    localStorage.removeItem(key(profileSlug));
  } catch {
    // ignore
  }
}
