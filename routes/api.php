<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CountdownController;
use App\Http\Controllers\DataController;
use App\Http\Controllers\NoteController;
use App\Http\Controllers\StateController;
use App\Http\Controllers\TaskController;
use App\Http\Middleware\AuthenticateApiToken;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::middleware('throttle:20,1')->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login', [AuthController::class, 'login']);
    });
    Route::post('logout', [AuthController::class, 'logout']);
});

Route::middleware(AuthenticateApiToken::class)->group(function () {
    // Settings + all lists in one response, used when the app loads.
    Route::get('state', StateController::class);

    // Misc UI settings (scene, filters, volumes...) as key => JSON value.
    Route::get('data', [DataController::class, 'index']);
    Route::patch('data', [DataController::class, 'update']);

    // Per-user lists, one row per item.
    foreach ([
        'tasks' => TaskController::class,
        'notes' => NoteController::class,
        'countdowns' => CountdownController::class,
    ] as $list => $controller) {
        Route::controller($controller)->prefix($list)->group(function () {
            Route::get('/', 'index');
            Route::post('/', 'store');
            Route::put('order', 'reorder');
            Route::patch('{id}', 'update');
            Route::delete('{id}', 'destroy');
        });
    }
});
