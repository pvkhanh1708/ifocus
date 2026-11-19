<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single persisted frontend setting. `value` holds raw JSON text and is
 * decoded with objects preserved, so `{}` does not come back as `[]`.
 */
class UserData extends Model
{
    protected $table = 'user_data';

    protected $fillable = ['user_id', 'key', 'value'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** All settings of a user as a key => value object. */
    public static function mapFor(User $user): object
    {
        $data = new \stdClass;

        static::where('user_id', $user->id)
            ->orderBy('id')
            ->get(['key', 'value'])
            ->each(function (UserData $row) use ($data) {
                $data->{$row->key} = json_decode($row->value);
            });

        return $data;
    }

    /** Atomic insert-or-update of one key (INSERT ... ON DUPLICATE KEY UPDATE). */
    public static function put(User $user, string $key, mixed $value): void
    {
        $now = now();

        static::query()->upsert(
            [[
                'user_id' => $user->id,
                'key' => $key,
                'value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['user_id', 'key'],
            ['value', 'updated_at'],
        );
    }
}
