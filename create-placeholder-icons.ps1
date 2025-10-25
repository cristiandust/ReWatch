# PowerShell script to create placeholder icon files
# This creates simple colored PNG files as placeholders

$sizes = @(16, 32, 48, 128)
$iconsDir = ".\icons"

Add-Type -AssemblyName System.Drawing

foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    # Fill with gradient-like purple color
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(102, 126, 234))
    $graphics.FillRectangle($brush, 0, 0, $size, $size)
    
    # Draw a simple play triangle in white
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $centerX = $size / 2
    $centerY = $size / 2
    $playSize = $size * 0.4
    
    $points = @(
        [System.Drawing.PointF]::new($centerX - $playSize * 0.3, $centerY - $playSize * 0.5),
        [System.Drawing.PointF]::new($centerX - $playSize * 0.3, $centerY + $playSize * 0.5),
        [System.Drawing.PointF]::new($centerX + $playSize * 0.5, $centerY)
    )
    
    $graphics.FillPolygon($whiteBrush, $points)
    
    # Save the image
    $filename = Join-Path $iconsDir "icon$size.png"
    $bitmap.Save($filename, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "Created $filename"
    
    $graphics.Dispose()
    $bitmap.Dispose()
    $brush.Dispose()
    $whiteBrush.Dispose()
}

Write-Host "All placeholder icons created successfully!"
