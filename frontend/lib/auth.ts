const TOKEN_KEY = "conceptscape.access_token";
const WORKSPACE_KEY = "conceptscape.workspace_id";
const SUBJECT_KEY = "conceptscape.subject_id";
const LOGGED_OUT_KEY = "conceptscape.logged_out";

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: { id: string; email: string; display_name: string };
  workspace?: { id: string; name: string } | null;
};

export type UserProfile = {
  fullName: string;
  shortName: string;
  email: string;
  role: string;
  institution: string;
  bio: string;
  avatarColor: string;
};

/**
 * What a profile looks like before the signed-in user is known.
 *
 * Deliberately anonymous: a real name baked in here showed up as somebody
 * else's account in the navbar and on the members list until the server
 * replied, which is worse than showing nothing.
 */
export const DEFAULT_PROFILE: UserProfile = {
  fullName: "",
  shortName: "",
  email: "",
  role: "",
  institution: "",
  bio: "",
  avatarColor: "#4A2818",
};

/** Initials for an avatar, derived from whatever name we actually have. */
export function initialsOf(name: string, email = ""): string {
  const source = (name || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function isAuthenticated(): boolean {
  return getToken() !== null && getWorkspaceId() !== null;
}

export function getUserProfile(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem("conceptscape.user_profile");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...parsed };
    }
    const uRaw = window.localStorage.getItem("conceptscape.user");
    if (uRaw) {
      const u = JSON.parse(uRaw);
      if (u.display_name || u.email) {
        const full = u.display_name || u.email || "";
        return {
          ...DEFAULT_PROFILE,
          fullName: full,
          shortName: full.split(" ")[0] || "",
          email: u.email || "",
        };
      }
    }
  } catch {}
  return DEFAULT_PROFILE;
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("conceptscape.user_profile", JSON.stringify(profile));
  try {
    const uRaw = window.localStorage.getItem("conceptscape.user");
    const u = uRaw ? JSON.parse(uRaw) : {};
    u.display_name = profile.fullName;
    u.email = profile.email;
    window.localStorage.setItem("conceptscape.user", JSON.stringify(u));
  } catch {}
  window.dispatchEvent(new CustomEvent("conceptscape:profile-updated", { detail: profile }));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token;
}

export function getWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WORKSPACE_KEY);
}

export function getSubjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SUBJECT_KEY);
}

export function setSubjectId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(SUBJECT_KEY, id);
  else window.localStorage.removeItem(SUBJECT_KEY);
}

export function setWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  const previous = window.localStorage.getItem(WORKSPACE_KEY);
  if (previous && previous !== id) window.localStorage.removeItem(SUBJECT_KEY);
  window.localStorage.setItem(WORKSPACE_KEY, id);
}

export function saveSession(data: AuthResponse): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOGGED_OUT_KEY);
  // A login can replace a different account in the same browser tab. Never
  // let that account inherit the previous account's workspace or subject.
  window.localStorage.removeItem(WORKSPACE_KEY);
  window.localStorage.removeItem(SUBJECT_KEY);
  window.localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.workspace?.id) setWorkspaceId(data.workspace.id);
  if (data.user) window.localStorage.setItem("conceptscape.user", JSON.stringify(data.user));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(WORKSPACE_KEY);
  window.localStorage.removeItem(SUBJECT_KEY);
  window.localStorage.removeItem("conceptscape.user");
  window.localStorage.setItem(LOGGED_OUT_KEY, "true");
}

export function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = getToken();
  const workspace = getWorkspaceId();
  const subject = getSubjectId();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspace) headers["X-Workspace-ID"] = workspace;
  if (subject) headers["X-Subject-ID"] = subject;
  return headers;
}
