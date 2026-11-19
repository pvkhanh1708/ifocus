<?php

namespace App\Http\Controllers;

use App\Models\Countdown;

class CountdownController extends ListItemController
{
    protected string $model = Countdown::class;
}
