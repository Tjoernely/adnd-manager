# scripts/match-plains-hills.ps1
#
# Colour-matches plains_hills.png to plains_flat.png: scales each RGB
# channel so the tile MEAN matches plains_flat's mean while structure and
# contrast are preserved (linear per-channel gain, clamped).
#
# Input : tiles_128/plains_flat.png + tiles_128/plains_hills.png
# Output: public/tiles/plains_hills_v2.png (repo-tracked; the build copies
#         it to server/public/tiles/ — same deploy pattern as swamp_flat_v2)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class TileColorMatch {
    static byte[] Load(string path, out int w, out int h) {
        using (var src = new Bitmap(path)) {
            w = src.Width; h = src.Height;
            var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, w, h);
            var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var buf = new byte[Math.Abs(data.Stride) * h];
            Marshal.Copy(data.Scan0, buf, 0, buf.Length);
            bmp.UnlockBits(data);
            bmp.Dispose();
            return buf;
        }
    }
    static double[] Mean(byte[] buf) {
        double b = 0, g = 0, r = 0; long n = buf.Length / 4;
        for (int i = 0; i < buf.Length; i += 4) { b += buf[i]; g += buf[i + 1]; r += buf[i + 2]; }
        return new double[] { b / n, g / n, r / n };
    }
    public static string Match(string flatPath, string hillsPath, string outPath) {
        int fw, fh, hw, hh;
        var flat  = Load(flatPath, out fw, out fh);
        var hills = Load(hillsPath, out hw, out hh);
        var mf = Mean(flat);
        var mh = Mean(hills);
        var gain = new double[3];
        for (int c = 0; c < 3; c++) gain[c] = mh[c] < 1 ? 1 : mf[c] / mh[c];
        for (int i = 0; i < hills.Length; i += 4)
            for (int c = 0; c < 3; c++)
                hills[i + c] = (byte)Math.Max(0, Math.Min(255, (int)Math.Round(hills[i + c] * gain[c])));
        var outBmp = new Bitmap(hw, hh, PixelFormat.Format32bppArgb);
        var od = outBmp.LockBits(new Rectangle(0, 0, hw, hh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(hills, 0, od.Scan0, hills.Length);
        outBmp.UnlockBits(od);
        outBmp.Save(outPath, ImageFormat.Png);
        outBmp.Dispose();
        return string.Format("gains B/G/R = {0:F3} / {1:F3} / {2:F3}  (flat mean {3:F0}/{4:F0}/{5:F0}, hills mean {6:F0}/{7:F0}/{8:F0})",
            gain[0], gain[1], gain[2], mf[0], mf[1], mf[2], mh[0], mh[1], mh[2]);
    }
}
"@
Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing

$root  = Split-Path -Parent $PSScriptRoot
$flat  = Join-Path $root 'tiles_128\plains_flat.png'
$hills = Join-Path $root 'tiles_128\plains_hills.png'
$out   = Join-Path $root 'public\tiles\plains_hills_v2.png'
$result = [TileColorMatch]::Match($flat, $hills, $out)
Write-Host "plains_hills_v2.png written. $result"
