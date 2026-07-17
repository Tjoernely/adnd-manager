# scripts/match-tile-tone.ps1
#
# Generic tile tone-matcher: scales the SOURCE tile's RGB channels a given
# PERCENT of the way toward the TARGET tile's per-channel mean (structure
# and contrast preserved; linear gain, clamped).
#
# Usage:
#   powershell -File scripts/match-tile-tone.ps1 `
#     -Source public\tiles\swamp_flat_v2.png `
#     -Target tiles_128\swamp_trees.png `
#     -Out    public\tiles\swamp_flat_v3.png `
#     -Percent 75

param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Target,
    [Parameter(Mandatory)][string]$Out,
    [double]$Percent = 75
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$csharp = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class TileToneMatch {
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
    public static string Match(string srcPath, string tgtPath, string outPath, double percent) {
        int sw, sh, tw, th;
        var src = Load(srcPath, out sw, out sh);
        var tgt = Load(tgtPath, out tw, out th);
        var ms = Mean(src);
        var mt = Mean(tgt);
        var f = percent / 100.0;
        var gain = new double[3];
        for (int c = 0; c < 3; c++) {
            double goal = ms[c] + (mt[c] - ms[c]) * f;   // partial move toward target
            gain[c] = ms[c] < 1 ? 1 : goal / ms[c];
        }
        for (int i = 0; i < src.Length; i += 4)
            for (int c = 0; c < 3; c++)
                src[i + c] = (byte)Math.Max(0, Math.Min(255, (int)Math.Round(src[i + c] * gain[c])));
        var outBmp = new Bitmap(sw, sh, PixelFormat.Format32bppArgb);
        var od = outBmp.LockBits(new Rectangle(0, 0, sw, sh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(src, 0, od.Scan0, src.Length);
        outBmp.UnlockBits(od);
        outBmp.Save(outPath, ImageFormat.Png);
        outBmp.Dispose();
        return string.Format("{0}% toward target: gains B/G/R = {1:F3}/{2:F3}/{3:F3} (src {4:F0}/{5:F0}/{6:F0} -> tgt {7:F0}/{8:F0}/{9:F0})",
            percent, gain[0], gain[1], gain[2], ms[0], ms[1], ms[2], mt[0], mt[1], mt[2]);
    }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'TileToneMatch').Type) {
    Add-Type -TypeDefinition $csharp -ReferencedAssemblies System.Drawing
}

$root = Split-Path -Parent $PSScriptRoot
$s = Join-Path $root $Source
$t = Join-Path $root $Target
$o = Join-Path $root $Out
$result = [TileToneMatch]::Match($s, $t, $o, $Percent)
Write-Host "$(Split-Path -Leaf $o) written. $result"
