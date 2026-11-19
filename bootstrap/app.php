<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // The frontend reads `{ error: string }` from every failed API response.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof ValidationException) {
                return response()->json(['error' => $e->validator->errors()->first()], 422);
            }

            if ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
                $message = match ($status) {
                    404 => 'Không tìm thấy API.',
                    405 => 'Phương thức không được hỗ trợ.',
                    429 => 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
                    default => $e->getMessage() ?: 'Yêu cầu không thành công.',
                };

                return response()->json(['error' => $message], $status, $e->getHeaders());
            }

            return response()->json(['error' => 'Lỗi máy chủ.'], 500);
        });
    })->create();
