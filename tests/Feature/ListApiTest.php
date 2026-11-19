<?php

namespace Tests\Feature;

use App\Models\Countdown;
use App\Models\Note;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ListApiTest extends TestCase
{
    use RefreshDatabase;

    private array $headers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->headers = $this->login('alice');
    }

    private function login(string $username): array
    {
        $token = $this->postJson('/api/auth/register', ['username' => $username, 'password' => 'secret123'])->json('token');

        return ['Authorization' => "Bearer {$token}"];
    }

    public function test_task_crud(): void
    {
        $this->postJson('/api/tasks', ['id' => 't1', 'text' => 'Viết báo cáo', 'completed' => false, 'estimatedPomodoros' => 2], $this->headers)
            ->assertCreated()
            ->assertExactJson(['item' => ['id' => 't1', 'text' => 'Viết báo cáo', 'completed' => false, 'estimatedPomodoros' => 2]]);
        $this->postJson('/api/tasks', ['id' => 't2', 'text' => 'Đọc sách'], $this->headers)->assertCreated();

        $this->patchJson('/api/tasks/t1', ['completed' => true], $this->headers)
            ->assertOk()->assertJsonPath('item.completed', true)->assertJsonPath('item.text', 'Viết báo cáo');

        $this->deleteJson('/api/tasks/t2', [], $this->headers)->assertOk();
        $this->deleteJson('/api/tasks/t2', [], $this->headers)->assertOk(); // idempotent

        $this->getJson('/api/tasks', $this->headers)->assertExactJson(['items' => [
            ['id' => 't1', 'text' => 'Viết báo cáo', 'completed' => true, 'estimatedPomodoros' => 2],
        ]]);
    }

    public function test_tasks_append_while_notes_and_countdowns_prepend(): void
    {
        foreach (['a', 'b', 'c'] as $id) {
            $this->postJson('/api/tasks', ['id' => $id, 'text' => $id], $this->headers);
            $this->postJson('/api/notes', ['id' => $id, 'title' => $id, 'content' => '', 'updatedAt' => 1], $this->headers);
            $this->postJson('/api/countdowns', ['id' => $id, 'title' => $id, 'type' => 'daysSince', 'targetAt' => '2026-01-01'], $this->headers);
        }

        $this->assertSame(['a', 'b', 'c'], array_column($this->getJson('/api/tasks', $this->headers)->json('items'), 'id'));
        $this->assertSame(['c', 'b', 'a'], array_column($this->getJson('/api/notes', $this->headers)->json('items'), 'id'));
        $this->assertSame(['c', 'b', 'a'], array_column($this->getJson('/api/countdowns', $this->headers)->json('items'), 'id'));
    }

    public function test_create_is_idempotent_on_retry(): void
    {
        $this->postJson('/api/tasks', ['id' => 'x', 'text' => 'one'], $this->headers)->assertCreated();
        $this->postJson('/api/tasks', ['id' => 'x', 'text' => 'one (retry)'], $this->headers)->assertOk();

        $this->assertSame(1, Task::count());
        $this->assertSame('one (retry)', Task::first()->text);
    }

    public function test_reorder(): void
    {
        foreach (['a', 'b', 'c', 'd'] as $id) {
            $this->postJson('/api/countdowns', ['id' => $id, 'title' => $id, 'type' => 'hoursUntil', 'targetAt' => '2026-12-01T10:00'], $this->headers);
        }

        // Unknown ids are ignored; ids left out keep their order after the listed ones.
        $this->putJson('/api/countdowns/order', ['ids' => ['b', 'zzz', 'a']], $this->headers)->assertOk();

        $this->assertSame(['b', 'a', 'd', 'c'], array_column($this->getJson('/api/countdowns', $this->headers)->json('items'), 'id'));
    }

    public function test_reorder_uses_a_single_update_query(): void
    {
        foreach (range(1, 6) as $i) {
            $this->postJson('/api/countdowns', ['id' => "c{$i}", 'title' => "{$i}", 'type' => 'daysSince', 'targetAt' => '2026-01-01'], $this->headers);
        }

        DB::enableQueryLog();
        $this->putJson('/api/countdowns/order', ['ids' => ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']], $this->headers)->assertOk();
        $updates = collect(DB::getQueryLog())->filter(fn ($q) => str_starts_with(strtolower($q['query']), 'update "countdowns"'));

        $this->assertCount(1, $updates);
        $this->assertSame(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], array_column($this->getJson('/api/countdowns', $this->headers)->json('items'), 'id'));
    }

    public function test_state_returns_settings_and_all_lists(): void
    {
        $this->patchJson('/api/data', ['key' => 'currentEffect', 'value' => 'rain'], $this->headers);
        $this->postJson('/api/tasks', ['id' => 't', 'text' => 'T'], $this->headers);
        $this->postJson('/api/notes', ['id' => 'n', 'content' => 'N'], $this->headers);
        $this->postJson('/api/countdowns', ['id' => 'c', 'title' => 'C', 'type' => 'dailyCountdown', 'targetAt' => '18:00'], $this->headers);

        $this->getJson('/api/state', $this->headers)->assertOk()->assertExactJson([
            'data' => ['currentEffect' => 'rain'],
            'tasks' => [['id' => 't', 'text' => 'T', 'completed' => false, 'estimatedPomodoros' => 1]],
            'notes' => [['id' => 'n', 'title' => '', 'content' => 'N', 'updatedAt' => 0]],
            'countdowns' => [['id' => 'c', 'title' => 'C', 'type' => 'dailyCountdown', 'targetAt' => '18:00']],
        ]);
        $this->getJson('/api/state')->assertUnauthorized();
    }

    public function test_note_text_is_stored_verbatim(): void
    {
        $content = "  Dòng 1\n\n  thụt lề  \n";

        $this->postJson('/api/notes', ['id' => 'n1', 'title' => '', 'content' => '', 'updatedAt' => 1], $this->headers)
            ->assertCreated()->assertJsonPath('item.title', '');
        $this->patchJson('/api/notes/n1', ['content' => $content, 'updatedAt' => 1763540000000], $this->headers)->assertOk();

        $note = $this->getJson('/api/notes', $this->headers)->json('items.0');
        $this->assertSame($content, $note['content']);
        $this->assertSame(1763540000000, $note['updatedAt']);
    }

    public function test_countdown_optional_fields_are_omitted_when_null(): void
    {
        $this->postJson('/api/countdowns', ['id' => 'c1', 'title' => 'Về', 'type' => 'dailyCountdown', 'targetAt' => '18:00'], $this->headers)
            ->assertExactJson(['item' => ['id' => 'c1', 'title' => 'Về', 'type' => 'dailyCountdown', 'targetAt' => '18:00']]);

        $this->postJson('/api/countdowns', ['id' => 'c2', 'title' => 'Pomodoro', 'type' => 'duration', 'targetAt' => '', 'durationSeconds' => 1500, 'startedAt' => 1763540000000], $this->headers)
            ->assertJsonPath('item.durationSeconds', 1500)->assertJsonPath('item.startedAt', 1763540000000);
    }

    public function test_validation_errors(): void
    {
        $this->postJson('/api/tasks', ['text' => 'no id'], $this->headers)->assertStatus(422)->assertJsonStructure(['error']);
        $this->postJson('/api/tasks', ['id' => 't', 'text' => ''], $this->headers)->assertStatus(422);
        $this->postJson('/api/countdowns', ['id' => 'c', 'title' => 'x', 'type' => 'weird'], $this->headers)->assertStatus(422);
        $this->patchJson('/api/tasks/missing', ['completed' => true], $this->headers)->assertNotFound()->assertJsonStructure(['error']);
    }

    public function test_lists_are_private_per_user(): void
    {
        $this->postJson('/api/tasks', ['id' => 'shared-id', 'text' => 'của alice'], $this->headers);

        $bob = $this->login('bob');
        $this->getJson('/api/tasks', $bob)->assertExactJson(['items' => []]);
        $this->patchJson('/api/tasks/shared-id', ['text' => 'hack'], $bob)->assertNotFound();
        $this->deleteJson('/api/tasks/shared-id', [], $bob)->assertOk();

        // Same client id is allowed for another user and does not touch Alice's task.
        $this->postJson('/api/tasks', ['id' => 'shared-id', 'text' => 'của bob'], $bob)->assertCreated();
        $this->assertSame('của alice', Task::where('text', 'của alice')->value('text'));
        $this->assertSame(2, Task::count());
    }

    public function test_invalid_json_body_is_rejected_instead_of_ignored(): void
    {
        $this->postJson('/api/notes', ['id' => 'n1', 'content' => 'giữ nguyên'], $this->headers)->assertCreated();

        $server = $this->transformHeadersToServerVars($this->headers + ['Content-Type' => 'application/json', 'Accept' => 'application/json']);
        $this->call('PATCH', '/api/notes/n1', server: $server, content: "{\"content\":\"raw\nnewline\"}")
            ->assertStatus(400)->assertJson(['error' => 'Dữ liệu JSON không hợp lệ.']);

        $this->assertSame('giữ nguyên', Note::first()->content);
    }

    public function test_lists_require_auth(): void
    {
        $this->getJson('/api/notes')->assertUnauthorized();
        $this->postJson('/api/tasks', ['id' => 'a', 'text' => 'a'])->assertUnauthorized();
    }

    public function test_data_endpoint_rejects_list_keys(): void
    {
        $this->patchJson('/api/data', ['key' => 'tasks', 'value' => []], $this->headers)->assertStatus(400);
    }

    public function test_legacy_import_keeps_order_and_coerces_values(): void
    {
        $userId = User::first()->id;

        Task::importLegacy($userId, [
            ['id' => '2', 'text' => 'B', 'completed' => true, 'estimatedPomodoros' => 0],
            ['id' => '1', 'text' => 'A'],
            ['text' => 'no id is skipped'],
        ]);
        Countdown::importLegacy($userId, [(object) ['id' => 'c', 'title' => 'C', 'type' => 'bogus', 'targetAt' => '18:00']]);
        Note::importLegacy($userId, [['id' => 'n', 'content' => 'x']]);

        $this->assertSame(
            [['id' => '2', 'text' => 'B', 'completed' => true, 'estimatedPomodoros' => 1], ['id' => '1', 'text' => 'A', 'completed' => false, 'estimatedPomodoros' => 1]],
            $this->getJson('/api/tasks', $this->headers)->json('items'),
        );
        $this->assertSame('hoursUntil', Countdown::first()->type);
        $this->assertSame(['id' => 'n', 'title' => '', 'content' => 'x', 'updatedAt' => 0], Note::first()->toApi());
    }

    public function test_migration_moves_lists_out_of_user_data(): void
    {
        $userId = User::first()->id;
        DB::table('user_data')->insert([
            ['user_id' => $userId, 'key' => 'tasks', 'value' => json_encode([['id' => 't', 'text' => 'Từ JSON', 'completed' => false, 'estimatedPomodoros' => 1]])],
            ['user_id' => $userId, 'key' => 'bgInitialZoom', 'value' => '100'],
        ]);

        (require database_path('migrations/2026_11_19_000004_move_lists_out_of_user_data.php'))->up();

        $this->assertSame('Từ JSON', Task::first()->text);
        $this->assertSame(['bgInitialZoom'], DB::table('user_data')->pluck('key')->all());
    }
}
