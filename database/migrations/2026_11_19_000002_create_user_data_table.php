<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per (user, setting key). Each PATCH upserts a single row, so
        // concurrent saves of different keys can no longer overwrite each other.
        Schema::create('user_data', function (Blueprint $table) {
            $table->id();
            $table->char('user_id', 32);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->string('key', 100);
            $table->json('value');
            $table->timestamps();

            $table->unique(['user_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_data');
    }
};
