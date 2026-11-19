<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = ApiToken::findActive((string) $request->bearerToken());

        if (! $token || ! $token->user) {
            return response()->json(['error' => 'Phiên đăng nhập không hợp lệ.'], 401);
        }

        // Avoid a write on every request: refresh last_used_at at most hourly.
        if (! $token->last_used_at || $token->last_used_at->lt(now()->subHour())) {
            $token->forceFill(['last_used_at' => now()])->saveQuietly();
        }

        $request->attributes->set('api_token', $token);
        $request->setUserResolver(fn () => $token->user);

        return $next($request);
    }
}
