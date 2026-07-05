namespace SkysNativeMeter;

internal static class HotspotDivertPulse
{
    public static void Run(string[] ips, int freezeMs, int unfreezeMs, int count)
    {
        freezeMs = Math.Clamp(freezeMs, 50, 10_000);
        unfreezeMs = Math.Clamp(unfreezeMs, 20, 10_000);
        count = Math.Clamp(count, 1, 50);

        NetworkHelper.EmitJson(new
        {
            type = "pulse_start",
            engine = "windivert",
            count,
            freeze_ms = freezeMs,
            unfreeze_ms = unfreezeMs,
            targets = ips
        });

        for (var i = 0; i < count; i++)
        {
            using (var block = new HotspotDivertBlock(ips))
            {
                block.Start();
                Thread.Sleep(freezeMs);
                block.Stop();
            }

            if (i < count - 1)
            {
                Thread.Sleep(unfreezeMs);
            }
        }

        NetworkHelper.EmitJson(new { type = "pulse_done", engine = "windivert", count });
    }
}
