<?php

namespace App\Models;

class Task extends ListItem
{
    protected const FIELDS = [
        'text' => 'text',
        'completed' => 'completed',
        'estimatedPomodoros' => 'estimated_pomodoros',
    ];

    protected const NEW_ITEMS_FIRST = false;

    protected function casts(): array
    {
        return [
            'completed' => 'boolean',
            'estimated_pomodoros' => 'integer',
            'position' => 'integer',
        ];
    }

    protected static function fieldRules(): array
    {
        return [
            'text' => ['string', 'max:5000'],
            'completed' => ['boolean'],
            'estimatedPomodoros' => ['integer', 'min:1', 'max:999'],
        ];
    }

    protected static function requiredOnCreate(): array
    {
        return ['text'];
    }

    protected static function normalizeLegacy(array $attributes): array
    {
        return [
            'text' => (string) ($attributes['text'] ?? ''),
            'completed' => (bool) ($attributes['completed'] ?? false),
            'estimated_pomodoros' => max(1, min(999, (int) ($attributes['estimated_pomodoros'] ?? 1))),
        ];
    }
}
