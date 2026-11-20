import React, { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import type { useAuth } from "../hooks/useAuth";

type AuthProps = Pick<ReturnType<typeof useAuth>, "login" | "register" | "isLoading" | "notice">;

export default function AuthScreen({ login, register, isLoading, notice }: AuthProps) {
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
        <main className="fixed inset-0 flex flex-col items-center overflow-y-auto bg-neutral-950 px-4 pt-[max(1rem,var(--safe-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white">
            <form
                onSubmit={submit}
                className="my-auto w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl"
            >
                <div className="mb-6 text-center">
                    <img
                        src="/icons/icon-192.png"
                        alt="iFocus"
                        width={56}
                        height={56}
                        className="mx-auto mb-3 h-14 w-14 rounded-2xl shadow-lg shadow-black/40"
                    />
                    <h1 className="text-2xl font-semibold">iFocus</h1>
                    <p className="mt-1 text-sm text-white/50">
                        {isRegistering ? "Tạo tài khoản mới" : "Đăng nhập để đồng bộ dữ liệu"}
                    </p>
                </div>

                {notice && (
                    <p className="mb-4 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                        {notice}
                    </p>
                )}

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
