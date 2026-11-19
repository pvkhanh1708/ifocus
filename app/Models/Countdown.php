<?php

namespace App\Models;

class Countdown extends ListItem
{
    public const TYPES = ['daysSince', 'dailyCountdown', 'hoursUntil', 'duration'];

    protected const FIELDS = [
        'title' => 'title',
        'targetAt' => 'target_at',
        'type' => 'type',
        'durationSeconds' => 'duration_seconds',
        'startedAt' => 'started_at',
    ];

    protected const NEW_ITEMS_FIRST = true;

    protected $attributes = ['target_at' => ''];

    protected function casts(): array
    {
        return [
            'duration_seconds' => 'integer',
            'started_at' => 'integer',
            'position' => 'integer',
        ];
    }

    protected static function fieldRules(): array
    {
        return [
            'title' => ['string', 'max:255'],
            'targetAt' => ['nullable', 'string', 'max:32'],
            'type' => ['string', 'in:'.implode(',', self::TYPES)],
            'durationSeconds' => ['nullable', 'integer', 'min:0'],
            'startedAt' => ['nullable', 'integer', 'min:0'],
        ];
    }

    protected static function requiredOnCreate(): array
    {
        return ['title', 'type'];
    }

    public static function attributesFromApi(array $input): array
    {
        $attributes = parent::attributesFromApi($input);

        if (array_key_exists('target_at', $attributes)) {
            $attributes['target_at'] = (string) $attributes['target_at'];
        }

        return $attributes;
    }

    protected static function normalizeLegacy(array $attributes): array
    {
        $type = in_array($attributes['type'] ?? null, self::TYPES, true) ? $attributes['type'] : 'hoursUntil';

        return [
            'title' => mb_substr((string) ($attributes['title'] ?? ''), 0, 255),
            'type' => $type,
            'target_at' => mb_substr((string) ($attributes['target_at'] ?? ''), 0, 32),
            'duration_seconds' => isset($attributes['duration_seconds']) ? max(0, (int) $attributes['duration_seconds']) : null,
            'started_at' => isset($attributes['started_at']) ? max(0, (int) $attributes['started_at']) : null,
        ];
    }
}
