<?php
declare(strict_types=1);

const SESSION_TTL = 2592000;
$dbPath = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'db.json';

function sendJson(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: http://localhost:3000');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    sendJson(204, []);
}

function readDb(string $path): array
{
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0775, true);
    if (!file_exists($path)) file_put_contents($path, json_encode(['users' => [], 'sessions' => []]));
    $contents = file_get_contents($path);
    $db = json_decode($contents ?: '{}', true);
    return is_array($db) ? $db : ['users' => [], 'sessions' => []];
}

function writeDb(string $path, array $db): void
{
    $handle = fopen($path, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) sendJson(500, ['error' => 'Không thể khóa cơ sở dữ liệu.']);
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function requestBody(): array
{
    $body = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($body) ? $body : [];
}

function bearerToken(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    return preg_replace('/^Bearer\s+/i', '', $header) ?: '';
}

function publicUser(array $user): array
{
    return ['id' => $user['id'], 'username' => $user['username']];
}

function findUserByToken(array $db): ?array
{
    $token = bearerToken();
    foreach ($db['sessions'] ?? [] as $session) {
        if (($session['token'] ?? '') === $token && ($session['expiresAt'] ?? 0) > time() * 1000) {
            foreach ($db['users'] ?? [] as $user) {
                if (($user['id'] ?? '') === $session['userId']) return $user;
            }
        }
    }
    return null;
}

$path = isset($_GET['route'])
    ? '/' . trim((string)$_GET['route'], '/')
    : (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$path = preg_replace('#^/(?:api\.php|api)(?:/|$)#', '/', $path) ?: '/';
$db = readDb($dbPath);
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'POST' && $path === '/auth/register') {
        $body = requestBody();
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $password = (string)($body['password'] ?? '');
        if (strlen($username) < 3 || strlen($password) < 6) {
            sendJson(400, ['error' => 'Tên đăng nhập cần ít nhất 3 ký tự và mật khẩu ít nhất 6 ký tự.']);
        }
        foreach ($db['users'] ?? [] as $user) {
            if ($user['username'] === $username) sendJson(409, ['error' => 'Tên đăng nhập đã tồn tại.']);
        }
        $user = [
            'id' => bin2hex(random_bytes(16)),
            'username' => $username,
            'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
            'data' => [],
        ];
        $token = bin2hex(random_bytes(32));
        $db['users'][] = $user;
        $db['sessions'][] = ['token' => $token, 'userId' => $user['id'], 'expiresAt' => (time() + SESSION_TTL) * 1000];
        writeDb($dbPath, $db);
        sendJson(201, ['token' => $token, 'user' => publicUser($user)]);
    }

    if ($method === 'POST' && $path === '/auth/login') {
        $body = requestBody();
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $matchedUser = null;
        foreach ($db['users'] ?? [] as $user) {
            if (($user['username'] ?? '') === $username) $matchedUser = $user;
        }
        if (!$matchedUser || !password_verify($password, $matchedUser['passwordHash'] ?? '')) {
            sendJson(401, ['error' => 'Tên đăng nhập hoặc mật khẩu không đúng.']);
        }
        $token = bin2hex(random_bytes(32));
        $db['sessions'] = array_values(array_filter($db['sessions'] ?? [], fn ($session) => $session['userId'] !== $matchedUser['id']));
        $db['sessions'][] = ['token' => $token, 'userId' => $matchedUser['id'], 'expiresAt' => (time() + SESSION_TTL) * 1000];
        writeDb($dbPath, $db);
        sendJson(200, ['token' => $token, 'user' => publicUser($matchedUser)]);
    }

    if ($method === 'POST' && $path === '/auth/logout') {
        $token = bearerToken();
        $db['sessions'] = array_values(array_filter($db['sessions'] ?? [], fn ($session) => $session['token'] !== $token));
        writeDb($dbPath, $db);
        sendJson(200, ['ok' => true]);
    }

    if ($path === '/data') {
        $user = findUserByToken($db);
        if (!$user) sendJson(401, ['error' => 'Phiên đăng nhập không hợp lệ.']);
        if ($method === 'GET') sendJson(200, ['data' => $user['data'] ?? []]);
        if ($method === 'PATCH') {
            $body = requestBody();
            $key = (string)($body['key'] ?? '');
            if ($key === '') sendJson(400, ['error' => 'Thiếu khóa dữ liệu.']);
            $updatedData = $user['data'] ?? [];
            foreach ($db['users'] as &$dbUser) {
                if ($dbUser['id'] === $user['id']) {
                    $updatedData = array_merge($dbUser['data'] ?? [], [$key => $body['value'] ?? null]);
                    $dbUser['data'] = $updatedData;
                    break;
                }
            }
            unset($dbUser);
            writeDb($dbPath, $db);
            sendJson(200, ['data' => $updatedData]);
        }
    }

    sendJson(404, ['error' => 'Không tìm thấy API.']);
} catch (Throwable $error) {
    error_log((string)$error);
    sendJson(500, ['error' => 'Lỗi máy chủ.']);
}
