<?php

namespace Tests\Feature;

use App\Models\ApiToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    private function register(string $username = 'Alice', string $password = 'secret123'): array
    {
        return $this->postJson('/api/auth/register', compact('username', 'password'))
            ->assertCreated()
            ->json();
    }

    private function auth(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }

    public function test_register_returns_token_and_normalized_user(): void
    {
        $session = $this->register();

        $this->assertSame('alice', $session['user']['username']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $session['user']['id']);
        $this->assertSame(64, strlen($session['token']));
        $this->assertDatabaseHas('api_tokens', ['token_hash' => hash('sha256', $session['token'])]);
    }

    public function test_register_validates_and_rejects_duplicates(): void
    {
        $this->postJson('/api/auth/register', ['username' => 'ab', 'password' => 'secret123'])
            ->assertStatus(400)->assertJsonStructure(['error']);

        $this->register('bob');
        $this->postJson('/api/auth/register', ['username' => ' BOB ', 'password' => 'secret123'])
            ->assertStatus(409)->assertJson(['error' => 'Tên đăng nhập đã tồn tại.']);
    }

    public function test_login_and_logout(): void
    {
        $this->register('carol', 'secret123');

        $this->postJson('/api/auth/login', ['username' => 'carol', 'password' => 'wrong-pass'])
            ->assertUnauthorized()->assertJsonStructure(['error']);

        $token = $this->postJson('/api/auth/login', ['username' => 'Carol', 'password' => 'secret123'])
            ->assertOk()->json('token');

        $this->getJson('/api/data', $this->auth($token))->assertOk();

        $this->postJson('/api/auth/logout', [], $this->auth($token))->assertOk();
        $this->getJson('/api/data', $this->auth($token))->assertUnauthorized();
    }

    public function test_data_requires_valid_token(): void
    {
        $this->getJson('/api/data')->assertUnauthorized()
            ->assertJson(['error' => 'Phiên đăng nhập không hợp lệ.']);

        $session = $this->register();
        ApiToken::query()->update(['expires_at' => now()->subMinute()]);

        $this->getJson('/api/data', $this->auth($session['token']))->assertUnauthorized();
    }

    public function test_patch_keys_are_independent_and_round_trip(): void
    {
        $token = $this->register()['token'];
        $headers = $this->auth($token);

        $this->patchJson('/api/data', ['key' => 'tasks', 'value' => [['id' => '1', 'text' => 'Việc 1']]], $headers)->assertOk();
        $this->patchJson('/api/data', ['key' => 'currentEffect', 'value' => 'rain'], $headers)->assertOk();
        $this->patchJson('/api/data', ['key' => 'currentEffect', 'value' => 'snow'], $headers)->assertOk();
        $this->patchJson('/api/data', ['key' => 'cleared', 'value' => null], $headers)->assertOk();

        $this->getJson('/api/data', $headers)->assertOk()->assertExactJson(['data' => [
            'tasks' => [['id' => '1', 'text' => 'Việc 1']],
            'currentEffect' => 'snow',
            'cleared' => null,
        ]]);
    }

    public function test_empty_objects_are_preserved(): void
    {
        $headers = $this->auth($this->register()['token']);

        $this->call('PATCH', '/api/data', server: $this->transformHeadersToServerVars($headers + ['Content-Type' => 'application/json']),
            content: '{"key":"cfg","value":{"a":{},"b":[]}}')->assertOk();

        $raw = $this->getJson('/api/data', $headers)->getContent();
        $this->assertStringContainsString('"cfg":{"a":{},"b":[]}', $raw);
    }

    public function test_users_cannot_see_each_others_data(): void
    {
        $a = $this->auth($this->register('alice')['token']);
        $b = $this->auth($this->register('bob')['token']);

        $this->patchJson('/api/data', ['key' => 'notes', 'value' => 'bí mật'], $a)->assertOk();

        $this->getJson('/api/data', $b)->assertExactJson(['data' => []]);
    }

    public function test_patch_requires_key(): void
    {
        $headers = $this->auth($this->register()['token']);

        $this->patchJson('/api/data', ['value' => 1], $headers)->assertStatus(400);
    }

    public function test_unknown_api_route_returns_json_error(): void
    {
        $this->getJson('/api/nope')->assertNotFound()->assertJson(['error' => 'Không tìm thấy API.']);
    }

    public function test_deleting_user_removes_tokens_and_data(): void
    {
        $session = $this->register();
        $this->patchJson('/api/data', ['key' => 'x', 'value' => 1], $this->auth($session['token']));

        User::find($session['user']['id'])->delete();

        $this->assertDatabaseCount('api_tokens', 0);
        $this->assertDatabaseCount('user_data', 0);
    }
}
