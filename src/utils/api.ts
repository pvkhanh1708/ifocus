export interface AuthUser {
    id: string;
    username: string;
}

export interface Session {
    token: string;
    user: AuthUser;
}

const API_BASE = import.meta.env.VITE_API_URL || "";
const SESSION_KEY = "ifocus-session";

export const getSession = (): Session | null => {
    try {
        const value = window.localStorage.getItem(SESSION_KEY);
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

export const setSession = (session: Session) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = () => {
    window.localStorage.removeItem(SESSION_KEY);
};

export const apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    const session = getSession();
    const requestPath =
        !API_BASE && !import.meta.env.DEV
            ? `/api.php?route=${encodeURIComponent(path.replace(/^\/api/, ""))}`
            : `${API_BASE}${path}`;
    const response = await fetch(requestPath, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
            ...options.headers,
        },
    });
    const body = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(body.error || "Yêu cầu không thành công.");
    return body;
};
