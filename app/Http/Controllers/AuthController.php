<?php

namespace App\Http\Controllers;

use App\Models\ApiToken;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        [$username, $password] = $this->credentials($request);

        if (mb_strlen($username) < 3 || mb_strlen($username) > 64 || strlen($password) < 6) {
            return $this->error(400, 'Tên đăng nhập cần 3–64 ký tự và mật khẩu ít nhất 6 ký tự.');
        }

        if (User::where('username', $username)->exists()) {
            return $this->error(409, 'Tên đăng nhập đã tồn tại.');
        }

        try {
            $user = User::create(['username' => $username, 'password' => $password]);
        } catch (UniqueConstraintViolationException) {
            return $this->error(409, 'Tên đăng nhập đã tồn tại.');
        }

        return response()->json($this->session($user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        [$username, $password] = $this->credentials($request);

        $user = User::where('username', $username)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            return $this->error(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
        }

        // Drop this user's expired tokens; other devices stay logged in.
        $user->apiTokens()->where('expires_at', '<=', now())->delete();

        return response()->json($this->session($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $plain = (string) $request->bearerToken();

        if ($plain !== '') {
            ApiToken::where('token_hash', ApiToken::hash($plain))->delete();
        }

        return response()->json(['ok' => true]);
    }

    /** @return array{0: string, 1: string} */
    private function credentials(Request $request): array
    {
        return [
            mb_strtolower(trim((string) $request->input('username', ''))),
            (string) $request->input('password', ''),
        ];
    }

    private function session(User $user): array
    {
        return ['token' => ApiToken::issueFor($user), 'user' => $user->toPublic()];
    }

    private function error(int $status, string $message): JsonResponse
    {
        return response()->json(['error' => $message], $status);
    }
}
