<?php

namespace App\Http\Controllers;

use App\Models\ListItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CRUD + reorder for one per-user list. Subclasses only set $model.
 *
 *   GET    /api/{list}            -> { items: [...] }
 *   POST   /api/{list}            -> create (idempotent on `id`)
 *   PATCH  /api/{list}/{id}       -> partial update
 *   DELETE /api/{list}/{id}
 *   PUT    /api/{list}/order      -> { ids: [...] }
 */
abstract class ListItemController extends Controller
{
    /** @var class-string<ListItem> */
    protected string $model;

    public function index(Request $request): JsonResponse
    {
        return response()->json(['items' => $this->model::listFor($request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        $input = $request->validate($this->model::rules(creating: true));

        $item = $this->model::upsertFor(
            $request->user(),
            $input['id'],
            $this->model::attributesFromApi($input),
        );

        return response()->json(['item' => $item->toApi()], $item->wasRecentlyCreated ? 201 : 200);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $item = $this->find($request, $id);
        $input = $request->validate($this->model::rules(creating: false));

        $item->fill($this->model::attributesFromApi($input))->save();

        return response()->json(['item' => $item->toApi()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        // Deleting something already gone is fine (e.g. a retried request).
        $this->model::ownedBy($request->user())->where('client_id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $input = $request->validate([
            'ids' => ['present', 'array', 'max:5000'],
            'ids.*' => ['string', 'max:64'],
        ]);

        $this->model::reorderFor($request->user(), $input['ids']);

        return response()->json(['items' => $this->model::listFor($request->user())]);
    }

    private function find(Request $request, string $id): ListItem
    {
        $item = $this->model::ownedBy($request->user())->where('client_id', $id)->first();

        abort_unless($item, 404, 'Không tìm thấy mục này.');

        return $item;
    }
}
