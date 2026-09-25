import React, { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import type { useAuth } from "../hooks/useAuth";

type AuthProps = Pick<ReturnType<typeof useAuth>, "login" | "register" | "isLoading">;

export default function AuthScreen({ login, register, isLoading }: AuthProps) {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        try {
            if (isRegistering) await register(username, password);
            else await login(username, password);
        } catch (requestError) {
            setError((requestError as Error).message);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
            <form
                onSubmit={submit}
                className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl"
            >
                <div className="mb-6 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
                        F
                    </div>
                    <h1 className="text-2xl font-semibold">iFocus</h1>
                    <p className="mt-1 text-sm text-white/50">
                        {isRegistering ? "Tạo tài khoản mới" : "Đăng nhập để đồng bộ dữ liệu"}
                    </p>
                </div>

                <div className="space-y-3">
                    <input
                        required
                        minLength={3}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="Tên đăng nhập"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-white/50"
                    />
                    <input
                        required
                        minLength={6}
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Mật khẩu (ít nhất 6 ký tự)"
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 outline-none focus:border-white/50"
                    />
                </div>

                {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

                <button
                    disabled={isLoading}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
                >
                    {isRegistering ? <UserPlus size={17} /> : <LogIn size={17} />}
                    {isLoading ? "Đang xử lý..." : isRegistering ? "Đăng ký" : "Đăng nhập"}
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setIsRegistering((value) => !value);
                        setError("");
                    }}
                    className="mt-4 w-full text-sm text-white/60 hover:text-white"
                >
                    {isRegistering
                        ? "Đã có tài khoản? Đăng nhập"
                        : "Chưa có tài khoản? Đăng ký"}
                </button>
            </form>
        </main>
    );
}
