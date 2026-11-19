import { useEffect, useState } from "react";
import {
    apiRequest,
    clearSession,
    getSession,
    SESSION_EXPIRED_EVENT,
    setSession,
    type Session,
} from "../utils/api";

export function useAuth() {
    const [session, setSessionState] = useState<Session | null>(getSession);
    const [isLoading, setIsLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    // The server rejected our token: show the login screen with an explanation.
    useEffect(() => {
        const onExpired = () => {
            setSessionState(null);
            setNotice("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
        };
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, []);

    const authenticate = async (path: string, username: string, password: string) => {
        setIsLoading(true);
        try {
            const result = await apiRequest<Session>(path, {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            setSession(result);
            setSessionState(result);
            setNotice(null);
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

    return { session, isLoading, notice, login, register, logout };
}
