import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const scrypt = promisify(scryptCallback);
const port = Number(process.env.API_PORT || 4000);
const dbPath = resolve(process.cwd(), "data/db.json");

const ensureDb = () => {
    if (!existsSync(dbPath)) {
        mkdirSync(dirname(dbPath), { recursive: true });
        writeFileSync(dbPath, JSON.stringify({ users: [], sessions: [] }, null, 2));
    }
};

const readDb = () => {
    ensureDb();
    return JSON.parse(readFileSync(dbPath, "utf8"));
};

const writeDb = (db) => {
    writeFileSync(dbPath, JSON.stringify(db, null, 2));
};

const send = (response, status, body) => {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    });
    response.end(JSON.stringify(body));
};

const readBody = async (request) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    return body ? JSON.parse(body) : {};
};

const hashPassword = async (password, salt = randomBytes(16).toString("hex")) => {
    const derivedKey = await scrypt(password, salt, 64);
    return `${salt}:${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedHash) => {
    const [salt, key] = storedHash.split(":");
    const derivedKey = await scrypt(password, salt, 64);
    const storedKey = Buffer.from(key, "hex");
    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
};

const publicUser = (user) => ({ id: user.id, username: user.username });

const getAuthenticatedUser = (request, db) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    const session = db.sessions.find(
        (item) => item.token === token && item.expiresAt > Date.now()
    );
    return session ? db.users.find((user) => user.id === session.userId) : null;
};

const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
        send(response, 204, {});
        return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const db = readDb();

    try {
        if (request.method === "POST" && url.pathname === "/api/auth/register") {
            const { username, password } = await readBody(request);
            const normalizedUsername = String(username || "").trim().toLowerCase();
            if (normalizedUsername.length < 3 || String(password || "").length < 6) {
                send(response, 400, { error: "Tên đăng nhập cần ít nhất 3 ký tự và mật khẩu ít nhất 6 ký tự." });
                return;
            }
            if (db.users.some((user) => user.username === normalizedUsername)) {
                send(response, 409, { error: "Tên đăng nhập đã tồn tại." });
                return;
            }

            const user = {
                id: randomBytes(16).toString("hex"),
                username: normalizedUsername,
                passwordHash: await hashPassword(password),
                data: {},
            };
            const token = randomBytes(32).toString("hex");
            db.users.push(user);
            db.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
            writeDb(db);
            send(response, 201, { token, user: publicUser(user) });
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/auth/login") {
            const { username, password } = await readBody(request);
            const user = db.users.find((item) => item.username === String(username || "").trim().toLowerCase());
            if (!user || !(await verifyPassword(String(password || ""), user.passwordHash))) {
                send(response, 401, { error: "Tên đăng nhập hoặc mật khẩu không đúng." });
                return;
            }
            const token = randomBytes(32).toString("hex");
            db.sessions = db.sessions.filter((session) => session.userId !== user.id);
            db.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
            writeDb(db);
            send(response, 200, { token, user: publicUser(user) });
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/auth/logout") {
            const token = request.headers.authorization?.replace("Bearer ", "");
            db.sessions = db.sessions.filter((session) => session.token !== token);
            writeDb(db);
            send(response, 200, { ok: true });
            return;
        }

        if (url.pathname === "/api/data") {
            const user = getAuthenticatedUser(request, db);
            if (!user) {
                send(response, 401, { error: "Phiên đăng nhập không hợp lệ." });
                return;
            }
            if (request.method === "GET") {
                send(response, 200, { data: user.data || {} });
                return;
            }
            if (request.method === "PATCH") {
                const { key, value } = await readBody(request);
                user.data = { ...(user.data || {}), [key]: value };
                writeDb(db);
                send(response, 200, { data: user.data });
                return;
            }
        }

        send(response, 404, { error: "Không tìm thấy API." });
    } catch (error) {
        console.error(error);
        send(response, 500, { error: "Lỗi máy chủ." });
    }
});

server.listen(port, "0.0.0.0", () => {
    console.log(`iFocus API listening on http://localhost:${port}`);
});
