<?php

use Illuminate\Support\Facades\Route;

// The React SPA is built into public/index.html. The web server normally serves
// it directly; this route is a fallback for servers that send "/" to index.php.
Route::get('/', function () {
    $index = public_path('index.html');

    abort_unless(is_file($index), 404, 'Frontend chưa được build. Chạy "npm run build" ở thư mục gốc.');

    return response()->file($index, ['Content-Type' => 'text/html; charset=utf-8']);
});
