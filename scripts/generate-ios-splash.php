<?php

/**
 * Generate iOS PWA launch screens (apple-touch-startup-image) from the app icon.
 *
 * iOS ignores the manifest's background colour: without a launch image for the
 * exact device size, a home-screen app opens on a white screen. This writes one
 * PNG per device (iPhones portrait, iPads portrait + landscape) into
 * src/public/splash/ and prints the <link> tags to paste into src/index.html.
 *
 * Usage (from the project root):  php scripts/generate-ios-splash.php
 * Requires the GD extension (with FreeType for the app name).
 */

const BACKGROUND = [0x09, 0x10, 0x1e]; // same as manifest background_color
const APP_NAME = 'iFocus';

$root = dirname(__DIR__);
$iconPath = "$root/src/public/icons/icon-512.png";
$outDir = "$root/src/public/splash";
$font = getenv('SPLASH_FONT') ?: 'C:/Windows/Fonts/seguisb.ttf';

// [name, CSS width, CSS height, device pixel ratio, landscape too?]
$devices = [
    ['iphone-16-pro-max', 440, 956, 3, false],
    ['iphone-16-pro', 402, 874, 3, false],
    ['iphone-15-pro-max', 430, 932, 3, false], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
    ['iphone-15', 393, 852, 3, false],         // 14 Pro, 15, 15 Pro, 16
    ['iphone-14-plus', 428, 926, 3, false],    // 12/13 Pro Max, 14 Plus
    ['iphone-14', 390, 844, 3, false],         // 12, 13, 14, 12/13 Pro
    ['iphone-13-mini', 375, 812, 3, false],    // X, XS, 11 Pro, 12/13 mini
    ['iphone-11-pro-max', 414, 896, 3, false], // XS Max, 11 Pro Max
    ['iphone-11', 414, 896, 2, false],         // XR, 11
    ['iphone-8-plus', 414, 736, 3, false],
    ['iphone-se', 375, 667, 2, false],         // 6/7/8, SE 2/3
    ['ipad-pro-13-m4', 1032, 1376, 2, true],
    ['ipad-pro-12-9', 1024, 1366, 2, true],
    ['ipad-pro-11-m4', 834, 1210, 2, true],
    ['ipad-pro-11', 834, 1194, 2, true],
    ['ipad-air', 820, 1180, 2, true],          // Air 4/5, iPad 10
    ['ipad-10-5', 834, 1112, 2, true],
    ['ipad-10-2', 810, 1080, 2, true],         // iPad 7/8/9
    ['ipad-mini-6', 744, 1133, 2, true],
    ['ipad-mini', 768, 1024, 2, true],
];

if (! extension_loaded('gd')) {
    fwrite(STDERR, "The GD extension is required.\n");
    exit(1);
}

$icon = imagecreatefrompng($iconPath) ?: exit("Cannot read $iconPath\n");
if (! is_dir($outDir)) {
    mkdir($outDir, 0775, true);
}

/** Icon scaled to $size px with rounded (app-icon style) corners. */
function roundedIcon(GdImage $icon, int $size): GdImage
{
    $out = imagecreatetruecolor($size, $size);
    imagealphablending($out, false);
    imagesavealpha($out, true);
    imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
    imagecopyresampled($out, $icon, 0, 0, 0, 0, $size, $size, imagesx($icon), imagesy($icon));

    // Clear the corners outside a rounded rectangle (radius 22%), anti-aliased.
    $r = $size * 0.22;
    for ($y = 0; $y < $size; $y++) {
        for ($x = 0; $x < $size; $x++) {
            $dx = max($r - $x - 0.5, $x + 0.5 - ($size - $r), 0);
            $dy = max($r - $y - 0.5, $y + 0.5 - ($size - $r), 0);
            if ($dx === 0 && $dy === 0) {
                continue;
            }
            $coverage = max(0.0, min(1.0, $r - sqrt($dx * $dx + $dy * $dy) + 0.5));
            if ($coverage >= 1) {
                continue;
            }
            $c = imagecolorsforindex($out, imagecolorat($out, $x, $y));
            $alpha = (int) round(127 - (127 - $c['alpha']) * $coverage);
            imagesetpixel($out, $x, $y, imagecolorallocatealpha($out, $c['red'], $c['green'], $c['blue'], $alpha));
        }
    }

    return $out;
}

$links = [];
$iconCache = [];

foreach ($devices as [$name, $cssW, $cssH, $dpr, $withLandscape]) {
    $orientations = $withLandscape ? ['portrait', 'landscape'] : ['portrait'];

    foreach ($orientations as $orientation) {
        [$w, $h] = $orientation === 'portrait' ? [$cssW * $dpr, $cssH * $dpr] : [$cssH * $dpr, $cssW * $dpr];

        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, imagecolorallocate($img, ...BACKGROUND));
        imagealphablending($img, true);

        $iconSize = (int) round(min($w, $h) * 0.26);
        $iconCache[$iconSize] ??= roundedIcon($icon, $iconSize);
        $iconX = intdiv($w - $iconSize, 2);
        $iconY = (int) round($h / 2 - $iconSize * 0.62);
        imagecopy($img, $iconCache[$iconSize], $iconX, $iconY, 0, 0, $iconSize, $iconSize);

        if (is_file($font)) {
            $fontSize = $iconSize * 0.16;
            $box = imagettfbbox($fontSize, 0, $font, APP_NAME);
            $textW = $box[2] - $box[0];
            $textX = (int) round(($w - $textW) / 2 - $box[0]);
            $textY = (int) round($iconY + $iconSize + $fontSize * 1.9);
            imagettftext($img, $fontSize, 0, $textX, $textY, imagecolorallocate($img, 0xF1, 0xF5, 0xF9), $font, APP_NAME);
        }

        $file = "$name-$orientation.png";
        imagepng($img, "$outDir/$file", 9);
        imagedestroy($img);

        $links[] = sprintf(
            '<link rel="apple-touch-startup-image" media="screen and (device-width: %dpx) and (device-height: %dpx) and (-webkit-device-pixel-ratio: %d) and (orientation: %s)" href="/splash/%s" />',
            $cssW, $cssH, $dpr, $orientation, $file
        );
        fwrite(STDERR, sprintf("%-32s %4dx%-4d %6.1f KB\n", $file, $w, $h, filesize("$outDir/$file") / 1024));
    }
}

echo implode("\n", $links), "\n";
