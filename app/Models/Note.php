<?php

namespace App\Models;

class Note extends ListItem
{
    protected const FIELDS = [
        'title' => 'title',
        'content' => 'content',
        'updatedAt' => 'client_updated_at',
    ];

    protected const NEW_ITEMS_FIRST = true;

    protected $attributes = ['title' => '', 'content' => ''];

    protected function casts(): array
    {
        return [
            'client_updated_at' => 'integer',
            'position' => 'integer',
        ];
    }

    protected static function fieldRules(): array
    {
        return [
            // A new note starts with empty title/content; null is coerced to "" below.
            'title' => ['nullable', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:1000000'],
            'updatedAt' => ['integer', 'min:0'],
        ];
    }

    protected static function requiredOnCreate(): array
    {
        return [];
    }

    public static function attributesFromApi(array $input): array
    {
        $attributes = parent::attributesFromApi($input);

        foreach (['title', 'content'] as $column) {
            if (array_key_exists($column, $attributes)) {
                $attributes[$column] = (string) $attributes[$column];
            }
        }

        return $attributes;
    }

    protected static function normalizeLegacy(array $attributes): array
    {
        return [
            'title' => mb_substr((string) ($attributes['title'] ?? ''), 0, 255),
            'content' => (string) ($attributes['content'] ?? ''),
            'client_updated_at' => max(0, (int) ($attributes['client_updated_at'] ?? 0)),
        ];
    }
}
