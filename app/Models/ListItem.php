<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * Base for per-user list items (tasks, notes, countdowns).
 *
 * The frontend generates its own ids, stored in `client_id` and exposed as `id`.
 * Subclasses map API (camelCase) fields to columns via FIELDS and declare
 * validation rules; ordering is kept in `position`.
 */
abstract class ListItem extends Model
{
    /** API field => column. */
    protected const FIELDS = [];

    /** New items go to the top of the list (true) or the bottom (false). */
    protected const NEW_ITEMS_FIRST = false;

    protected $guarded = ['id', 'user_id'];

    /** Validation rules keyed by API field (without "required" / "sometimes"). */
    abstract protected static function fieldRules(): array;

    /** Fields that must be present when creating an item. */
    abstract protected static function requiredOnCreate(): array;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeOwnedBy(Builder $query, User|string $user): Builder
    {
        return $query->where('user_id', $user instanceof User ? $user->id : $user);
    }

    public static function rules(bool $creating): array
    {
        $rules = [];

        foreach (static::fieldRules() as $field => $fieldRules) {
            $presence = $creating && in_array($field, static::requiredOnCreate(), true) ? 'required' : 'sometimes';
            $rules[$field] = [$presence, ...$fieldRules];
        }

        if ($creating) {
            $rules['id'] = ['required', 'string', 'max:64'];
        }

        return $rules;
    }

    /** Convert validated API input to column attributes. */
    public static function attributesFromApi(array $input): array
    {
        $attributes = [];

        foreach (static::FIELDS as $field => $column) {
            if (array_key_exists($field, $input)) {
                $attributes[$column] = $input[$field];
            }
        }

        return $attributes;
    }

    /** Shape returned to the frontend; null optional fields are omitted. */
    public function toApi(): array
    {
        $item = ['id' => $this->client_id];

        foreach (static::FIELDS as $field => $column) {
            if ($this->{$column} !== null) {
                $item[$field] = $this->{$column};
            }
        }

        return $item;
    }

    /** @return array<int, array> */
    public static function listFor(User $user): array
    {
        return static::ownedBy($user)
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map->toApi()
            ->all();
    }

    /**
     * Create (or, when the client retries, update) an item. Position is only
     * assigned on first insert.
     */
    public static function upsertFor(User|string $user, string $clientId, array $attributes): static
    {
        $userId = $user instanceof User ? $user->id : $user;

        return DB::transaction(function () use ($userId, $clientId, $attributes) {
            $item = static::ownedBy($userId)->where('client_id', $clientId)->lockForUpdate()->first();

            if ($item) {
                $item->fill($attributes)->save();

                return $item;
            }

            $edge = static::NEW_ITEMS_FIRST
                ? (static::ownedBy($userId)->min('position') ?? 0) - 1
                : (static::ownedBy($userId)->max('position') ?? -1) + 1;

            $item = new static($attributes);
            $item->user_id = $userId;
            $item->client_id = $clientId;
            $item->position = $edge;
            $item->save();

            return $item;
        });
    }

    /** Persist a new order. Ids not listed keep their relative order after the listed ones. */
    public static function reorderFor(User $user, array $clientIds): void
    {
        DB::transaction(function () use ($user, $clientIds) {
            $items = static::ownedBy($user)
                ->orderBy('position')->orderBy('id')
                ->lockForUpdate()
                ->get(['id', 'client_id', 'position'])
                ->keyBy('client_id');

            $ordered = collect($clientIds)
                ->filter(fn ($id) => is_string($id) && $items->has($id))
                ->unique()
                ->values();
            $rest = $items->keys()->diff($ordered)->values();

            // Only rows whose position actually changes: [row id => new position].
            $changes = [];
            foreach ($ordered->concat($rest) as $position => $clientId) {
                if ($items[$clientId]->position !== $position) {
                    $changes[$items[$clientId]->id] = $position;
                }
            }

            if ($changes === []) {
                return;
            }

            // One UPDATE ... CASE statement instead of one query per row.
            // Both values are integers (row ids from the DB, loop indexes), cast to be safe.
            $cases = collect($changes)
                ->map(fn (int $position, int $id) => 'WHEN '.(int) $id.' THEN '.(int) $position)
                ->implode(' ');

            static::ownedBy($user)
                ->whereIn('id', array_keys($changes))
                ->update([
                    'position' => DB::raw("CASE id {$cases} END"),
                    'updated_at' => now(),
                ]);
        });
    }

    /**
     * Import a whole legacy JSON array (old user_data / db.json format) in its
     * current order. Existing items with the same id are updated.
     */
    public static function importLegacy(string $userId, iterable $items): int
    {
        $count = 0;

        foreach ($items as $position => $item) {
            $item = (array) $item;
            $clientId = isset($item['id']) ? (string) $item['id'] : '';

            if ($clientId === '' || strlen($clientId) > 64) {
                continue;
            }

            $attributes = static::normalizeLegacy(static::attributesFromApi($item));
            $model = static::ownedBy($userId)->where('client_id', $clientId)->first() ?? new static;
            $model->fill($attributes);
            $model->user_id = $userId;
            $model->client_id = $clientId;
            $model->position = $position;
            $model->save();
            $count++;
        }

        return $count;
    }

    /** Hook to coerce legacy values into valid column values. */
    protected static function normalizeLegacy(array $attributes): array
    {
        return $attributes;
    }
}
