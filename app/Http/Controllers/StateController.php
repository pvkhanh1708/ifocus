<?php

namespace App\Http\Controllers;

use App\Models\Countdown;
use App\Models\Note;
use App\Models\Task;
use App\Models\UserData;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Everything the app needs on load in a single request, instead of one
 * request per list (each of which would authenticate again).
 */
class StateController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => UserData::mapFor($user),
            'tasks' => Task::listFor($user),
            'notes' => Note::listFor($user),
            'countdowns' => Countdown::listFor($user),
        ]);
    }
}
