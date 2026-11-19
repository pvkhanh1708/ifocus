<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

#[Fillable(['username', 'password'])]
#[Hidden(['password'])]
class User extends Authenticatable
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (User $user) {
            $user->id ??= bin2hex(random_bytes(16));
        });
    }

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
        ];
    }

    public function apiTokens(): HasMany
    {
        return $this->hasMany(ApiToken::class);
    }

    public function data(): HasMany
    {
        return $this->hasMany(UserData::class);
    }

    /** Shape returned to the frontend. */
    public function toPublic(): array
    {
        return ['id' => $this->id, 'username' => $this->username];
    }
}
