<?php

namespace App\Console\Commands;

use App\Models\ApiToken;
use App\Models\Countdown;
use App\Models\Note;
use App\Models\Task;
use App\Models\User;
use App\Models\UserData;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

#[Signature('ifocus:import-json {path=data/db.json : Đường dẫn tới file db.json cũ}')]
#[Description('Import users, settings and sessions from the old data/db.json into MySQL (safe to re-run)')]
class ImportJsonDatabase extends Command
{
    /** Legacy data keys that are imported into their own tables. */
    private const LISTS = [
        'tasks' => Task::class,
        'notes' => Note::class,
        'countdowns' => Countdown::class,
    ];

    public function handle(): int
    {
        $path = $this->argument('path');

        if (! is_file($path)) {
            $this->error("Không tìm thấy file: {$path}");

            return self::FAILURE;
        }

        // Decode objects as stdClass so empty objects survive the round trip.
        $db = json_decode((string) file_get_contents($path), flags: JSON_THROW_ON_ERROR);

        $users = $db->users ?? [];
        $sessions = $db->sessions ?? [];
        $stats = ['users' => 0, 'keys' => 0, 'items' => 0, 'tokens' => 0, 'skipped' => 0];

        DB::transaction(function () use ($users, $sessions, &$stats) {
            foreach ($users as $row) {
                $username = mb_strtolower(trim((string) ($row->username ?? '')));
                $id = (string) ($row->id ?? '');

                if ($username === '' || ! preg_match('/^[0-9a-f]{32}$/', $id)) {
                    $stats['skipped']++;

                    continue;
                }

                // Insert the existing bcrypt hash as-is (bypasses the "hashed" cast).
                DB::table('users')->upsert([[
                    'id' => $id,
                    'username' => $username,
                    'password' => (string) $row->passwordHash,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]], ['id'], ['username', 'password', 'updated_at']);

                $user = User::findOrFail($id);
                $stats['users']++;

                foreach ((array) ($row->data ?? []) as $key => $value) {
                    $key = (string) $key;

                    if (isset(self::LISTS[$key])) {
                        $stats['items'] += is_array($value) ? self::LISTS[$key]::importLegacy($id, $value) : 0;
                    } else {
                        UserData::put($user, $key, $value);
                        $stats['keys']++;
                    }
                }
            }

            // Keep existing logins working: store the old tokens hashed.
            foreach ($sessions as $session) {
                $userId = (string) ($session->userId ?? '');
                $token = (string) ($session->token ?? '');
                $expiresAt = Carbon::createFromTimestampMs((int) ($session->expiresAt ?? 0));

                if ($token === '' || $expiresAt->isPast() || ! User::whereKey($userId)->exists()) {
                    continue;
                }

                ApiToken::updateOrCreate(
                    ['token_hash' => ApiToken::hash($token)],
                    ['user_id' => $userId, 'expires_at' => $expiresAt],
                );
                $stats['tokens']++;
            }
        });

        $this->info("Đã import {$stats['users']} user, {$stats['keys']} setting, {$stats['items']} task/note/countdown, {$stats['tokens']} phiên đăng nhập.");

        if ($stats['skipped'] > 0) {
            $this->warn("Bỏ qua {$stats['skipped']} user không hợp lệ.");
        }

        return self::SUCCESS;
    }
}
