<?php

namespace App\Http\Controllers;

use App\Models\UserData;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DataController extends Controller
{
    /** Keys that now live in their own tables (see routes/api.php). */
    public const LIST_KEYS = ['tasks', 'notes', 'countdowns'];

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => UserData::mapFor($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        // Decode the raw body ourselves so JSON objects stay objects ({} is not turned into []).
        $body = json_decode($request->getContent());

        if (! is_object($body)) {
            return response()->json(['error' => 'Dữ liệu gửi lên không hợp lệ.'], 400);
        }

        $key = is_string($body->key ?? null) ? trim($body->key) : '';

        if ($key === '' || mb_strlen($key) > 100) {
            return response()->json(['error' => 'Thiếu khóa dữ liệu.'], 400);
        }

        if (in_array($key, self::LIST_KEYS, true)) {
            return response()->json(['error' => "Dữ liệu \"{$key}\" được lưu qua /api/{$key}."], 400);
        }

        UserData::put($request->user(), $key, $body->value ?? null);

        return response()->json(['ok' => true, 'key' => $key]);
    }
}
