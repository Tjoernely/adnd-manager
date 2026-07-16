# scripts/fix-sprite-fringe.ps1
#
# Removes the light alpha fringe gpt-image-1 leaves on transparent sprites
# (semi-transparent edge pixels pre-blended against white -> visible halo
# when stamped on dark tiles).
#
# Per pixel:
#   alpha < 40        -> alpha = 0
#   alpha 40..200     -> un-premultiply against white:
#                        c = (c - (1-a)*255) / a   (a = alpha/255, clamped)
#
# Run AFTER scripts/generate-relief-sprites.mjs whenever sprites are
# regenerated:  powershell -File scripts/fix-sprite-fringe.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SpriteDefringe {
    public static void Process(string path) {
        using (var src = new Bitmap(path)) {
            var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);
            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int n = Math.Abs(data.Stride) * bmp.Height;
            var buf = new byte[n];
            Marshal.Copy(data.Scan0, buf, 0, n);
            for (int i = 0; i < n; i += 4) {
                byte a = buf[i + 3];                       // BGRA layout
                if (a < 40) { buf[i + 3] = 0; continue; }
                if (a <= 200) {
                    double af = a / 255.0;
                    for (int c = 0; c < 3; c++) {
                        double v = (buf[i + c] - (1.0 - af) * 255.0) / af;
                        buf[i + c] = (byte)Math.Max(0, Math.Min(255, (int)Math.Round(v)));
                    }
                }
            }
            Marshal.Copy(buf, 0, data.Scan0, n);
            bmp.UnlockBits(data);
            src.Dispose();
            bmp.Save(path, ImageFormat.Png);
            bmp.Dispose();
        }
    }
}
"@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root 'public\tiles\sprites'
Get-ChildItem "$dir\*.png" | ForEach-Object {
    [SpriteDefringe]::Process($_.FullName)
    Write-Host "defringed $($_.Name)"
}
Write-Host "Done - rebuild (npm run build) to refresh server/public copies."
