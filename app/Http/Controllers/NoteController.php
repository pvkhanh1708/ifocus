<?php

namespace App\Http\Controllers;

use App\Models\Note;

class NoteController extends ListItemController
{
    protected string $model = Note::class;
}
