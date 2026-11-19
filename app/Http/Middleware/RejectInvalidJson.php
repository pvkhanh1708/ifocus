<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Laravel treats an unparsable JSON body as empty input, so a broken request
 * would "succeed" while saving nothing. Fail loudly instead.
 */
class RejectInvalidJson
{
    public function handle(Request $request, Closure $next): Response
    {
        $content = $request->getContent();

        if ($request->isJson() && trim($content) !== '') {
            json_decode($content);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json(['error' => 'Dữ liệu JSON không hợp lệ.'], 400);
            }
        }

        return $next($request);
    }
}
