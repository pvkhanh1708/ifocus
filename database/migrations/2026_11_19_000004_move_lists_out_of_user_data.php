<?php

use App\Models\Countdown;
use App\Models\Note;
use App\Models\Task;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Move tasks / notes / countdowns that were stored as whole JSON arrays in
 * user_data into their own tables, then drop those user_data rows.
 */
return new class extends Migration
{
    private const LISTS = [
        'tasks' => Task::class,
        'notes' => Note::class,
        'countdowns' => Countdown::class,
    ];

    public function up(): void
    {
        DB::transaction(function () {
            $rows = DB::table('user_data')->whereIn('key', array_keys(self::LISTS))->get();

            foreach ($rows as $row) {
                $items = json_decode($row->value, true);

                if (is_array($items)) {
                    self::LISTS[$row->key]::importLegacy($row->user_id, array_values($items));
                }
            }

            DB::table('user_data')->whereIn('key', array_keys(self::LISTS))->delete();
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            foreach (self::LISTS as $key => $model) {
                $userIds = $model::query()->distinct()->pluck('user_id');

                foreach ($userIds as $userId) {
                    $items = $model::ownedBy($userId)->orderBy('position')->orderBy('id')->get()->map->toApi()->all();

                    DB::table('user_data')->updateOrInsert(
                        ['user_id' => $userId, 'key' => $key],
                        ['value' => json_encode($items, JSON_UNESCAPED_UNICODE), 'created_at' => now(), 'updated_at' => now()],
                    );
                }
            }
        });
    }
};
