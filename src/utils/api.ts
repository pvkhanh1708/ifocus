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

/** Fired when the server rejects the stored token (expired / revoked). */
export const SESSION_EXPIRED_EVENT = "ifocus:session-expired";

export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ApiError";
    }
}

/** A request that hangs (e.g. a stuck PHP worker) is aborted after this. */
const REQUEST_TIMEOUT_MS = 15_000;

export const apiRequest = async <T>(path: string, options: RequestInit = {}) => {
    const session = getSession();
    const timeout = new AbortController();
    const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            signal: timeout.signal,
            ...options,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
                ...options.headers,
            },
        });
    } catch {
        throw new ApiError("Không kết nối được tới máy chủ.", 0);
    } finally {
        window.clearTimeout(timer);
    }

    const body = (await response.json().catch(() => ({}))) as T & { error?: string };

    if (!response.ok) {
        // A stored token the server no longer accepts: drop it and send the user
        // back to the login screen instead of showing an empty app whose saves
        // all fail silently. (A wrong password on /api/auth/* is not this.)
        if (response.status === 401 && session && !path.startsWith("/api/auth/")) {
            if (getSession()?.token === session.token) {
                clearSession();
                window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
            }
        }
        throw new ApiError(body.error || "Yêu cầu không thành công.", response.status);
    }

    return body;
};

/** Network failure, timeout, rate limit or server error: worth trying again. */
export const isTransientError = (error: unknown) =>
    error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);

/**
 * Retry a request on transient errors with backoff (0.5s, 1s, 2s...). Only use
 * for idempotent requests — every save in this app is (creates carry their id).
 */
export const withRetry = async <T>(request: () => Promise<T>, attempts = 4): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
        try {
            return await request();
        } catch (error) {
            if (attempt >= attempts || !isTransientError(error)) throw error;
            await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** (attempt - 1)));
        }
    }
};
