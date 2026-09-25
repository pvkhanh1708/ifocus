import { useState } from "react";
import {
    apiRequest,
    clearSession,
    getSession,
    setSession,
    type Session,
} from "../utils/api";

export function useAuth() {
    const [session, setSessionState] = useState<Session | null>(getSession);
    const [isLoading, setIsLoading] = useState(false);

    const authenticate = async (path: string, username: string, password: string) => {
        setIsLoading(true);
        try {
            const result = await apiRequest<Session>(path, {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            setSession(result);
            setSessionState(result);
            return result;
        } finally {
            setIsLoading(false);
        }
    };

    const login = (username: string, password: string) =>
        authenticate("/api/auth/login", username, password);
    const register = (username: string, password: string) =>
        authenticate("/api/auth/register", username, password);

    const logout = async () => {
        try {
            await apiRequest("/api/auth/logout", { method: "POST" });
        } finally {
            clearSession();
            setSessionState(null);
        }
    };

    return { session, isLoading, login, register, logout };
}
