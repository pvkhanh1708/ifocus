<?php

namespace App\Http\Controllers;

use App\Models\Task;

class TaskController extends ListItemController
{
    protected string $model = Task::class;
}
