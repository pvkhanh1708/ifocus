<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApiToken extends Model
{
    public const TTL_DAYS = 30;

    protected $fillable = ['user_id', 'token_hash', 'expires_at', 'last_used_at'];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function hash(string $plainToken): string
    {
        return hash('sha256', $plainToken);
    }

    /** Create a token for the user and return the plain-text value (shown once). */
    public static function issueFor(User $user): string
    {
        $plain = bin2hex(random_bytes(32));

        static::create([
            'user_id' => $user->id,
            'token_hash' => static::hash($plain),
            'expires_at' => now()->addDays(static::TTL_DAYS),
        ]);

        return $plain;
    }

    public static function findActive(string $plainToken): ?self
    {
        if ($plainToken === '') {
            return null;
        }

        return static::with('user')
            ->where('token_hash', static::hash($plainToken))
            ->where('expires_at', '>', now())
            ->first();
    }
}
