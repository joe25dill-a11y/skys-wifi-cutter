namespace SkysNativeMeter;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length == 0 || args[0] is "-h" or "--help" or "help")
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter meter|cut|throttle|lag|pulse|oneway|restore|dnsblock|portblock|kick|ping|hotspot-block|hotspot-lag|hotspot-pulse|hotspot-check ...");
            return 1;
        }

        try
        {
            return args[0].ToLowerInvariant() switch
            {
                "meter" => RunMeter(args),
                "cut" => RunCut(args),
                "restore" => RunRestore(args),
                "dnsblock" => RunDnsBlock(args),
                "portblock" => RunPortBlock(args),
                "throttle" => RunThrottle(args),
                "lag" => RunLag(args),
                "pulse" => RunPulse(args),
                "oneway" => RunOneWay(args),
                "kick" => RunKick(args),
                "ping" => RunPing(args),
                "hotspot-block" => RunHotspotBlock(args),
                "hotspot-lag" => RunHotspotLag(args),
                "hotspot-pulse" => RunHotspotPulse(args),
                "hotspot-check" => RunHotspotCheck(args),
                _ => Unknown(args[0])
            };
        }
        catch (Exception ex)
        {
            NetworkHelper.EmitJson(new { type = "error", message = ex.Message });
            return 2;
        }
    }

    private static int Unknown(string cmd)
    {
        Console.Error.WriteLine($"Unknown command: {cmd}");
        return 1;
    }

    private static int RunMeter(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter meter <target_ip> <target_mac> <gateway_ip> <iface> [local_ip]");
            return 1;
        }

        var targetIp = args[1];
        var targetMac = args[2];
        var gatewayIp = args[3];
        var iface = args[4];
        var localIp = args.Length > 5 ? args[5] : "";

        using var meter = new ArpMeter(targetIp, targetMac, gatewayIp, iface, localIp);
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            meter.Dispose();
        };
        meter.Run();
        return 0;
    }

    private static int RunCut(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter cut <target_ip> <target_mac> <gateway_ip> <iface> [local_ip]");
            return 1;
        }

        using var cut = new ArpCut(args[1], args[2], args[3], args[4], args.Length > 5 ? args[5] : "");
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cut.Dispose();
        };
        cut.Run();
        return 0;
    }

    private static int RunDnsBlock(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine(
                "Usage: SkysNativeMeter dnsblock <target_ip> <target_mac> <gateway_ip> <iface> [local_ip] [domains_csv|*]");
            return 1;
        }

        var domains = args.Length > 6
            ? args[6].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : new[] { "*" };
        var mode = args.Length > 7 ? args[7] : "block";

        using var dns = new ArpDnsBlock(args[1], args[2], args[3], args[4], args.Length > 5 ? args[5] : "", domains, mode);
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            dns.Dispose();
        };
        dns.Run();
        return 0;
    }

    private static int RunPortBlock(string[] args)
    {
        if (args.Length < 7)
        {
            Console.Error.WriteLine(
                "Usage: SkysNativeMeter portblock <target_ip> <target_mac> <gateway_ip> <iface> <local_ip> <ports_csv>");
            return 1;
        }

        var ports = args[6]
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(p => int.TryParse(p, out var n) ? n : 0)
            .Where(n => n > 0);

        using var blocker = new ArpPortBlock(args[1], args[2], args[3], args[4], args[5], ports);
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            blocker.Dispose();
        };
        blocker.Run();
        return 0;
    }

    private static int RunThrottle(string[] args)
    {
        if (args.Length < 8)
        {
            Console.Error.WriteLine(
                "Usage: SkysNativeMeter throttle <target_ip> <target_mac> <gateway_ip> <iface> <local_ip> <upload_kbps> <download_kbps>");
            return 1;
        }

        var upload = int.TryParse(args[6], out var up) ? up : 0;
        var download = int.TryParse(args[7], out var down) ? down : 0;

        using var throttle = new ArpThrottle(args[1], args[2], args[3], args[4], args[5], upload, download);
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; throttle.Dispose(); };
        throttle.Run();
        return 0;
    }

    private static int RunLag(string[] args)
    {
        if (args.Length < 11)
        {
            Console.Error.WriteLine(
                "Usage: SkysNativeMeter lag <target_ip> <target_mac> <gateway_ip> <iface> <local_ip> <out_ms> <in_ms> <mode> <up_kbps> <down_kbps>");
            return 1;
        }

        var outMs = int.TryParse(args[6], out var om) ? om : 0;
        var inMs = int.TryParse(args[7], out var im) ? im : 0;
        var upKbps = int.TryParse(args[9], out var uk) ? uk : 0;
        var downKbps = int.TryParse(args[10], out var dk) ? dk : 0;

        using var lag = new ArpLag(args[1], args[2], args[3], args[4], args[5], outMs, inMs, args[8], upKbps, downKbps);
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; lag.Dispose(); };
        lag.Run();
        return 0;
    }

    private static int RunPulse(string[] args)
    {
        if (args.Length < 11)
        {
            Console.Error.WriteLine(
                "Usage: SkysNativeMeter pulse <target_ip> <target_mac> <gateway_ip> <iface> <local_ip> " +
                "<incoming_ms> <outgoing_ms> <freeze_ms> <unfreeze_ms> <count>");
            return 1;
        }

        var incomingMs = int.TryParse(args[6], out var im) ? im : 0;
        var outgoingMs = int.TryParse(args[7], out var om) ? om : 0;
        var freezeMs = int.TryParse(args[8], out var fm) ? fm : 200;
        var unfreezeMs = int.TryParse(args[9], out var um) ? um : 100;
        var count = int.TryParse(args[10], out var c) ? c : 6;

        using var pulse = new ArpLagPulse(
            args[1], args[2], args[3], args[4], args[5],
            incomingMs, outgoingMs, freezeMs, unfreezeMs, count);
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; pulse.Dispose(); };
        pulse.Run();
        return 0;
    }

    private static int RunOneWay(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter oneway <target_ip> <target_mac> <gateway_ip> <iface> [local_ip]");
            return 1;
        }

        using var oneway = new ArpOneWayKill(args[1], args[2], args[3], args[4], args.Length > 5 ? args[5] : "");
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; oneway.Dispose(); };
        oneway.Run();
        return 0;
    }

    private static int RunKick(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter kick <target_ip> <target_mac> <gateway_ip> <iface> [local_ip]");
            return 1;
        }

        var targetIp = args[1];
        var targetMac = args[2];
        var gatewayIp = args[3];
        var iface = args[4];
        var localIp = args.Length > 5 ? args[5] : "";

        using (var cut = new ArpCut(targetIp, targetMac, gatewayIp, iface, localIp))
        {
            cut.RunKickBurst();
        }

        Thread.Sleep(300);
        ArpRestore.Run(targetIp, targetMac, gatewayIp, iface, localIp);
        NetworkHelper.EmitJson(new { type = "kicked", ip = targetIp, mac = NetworkHelper.NormalizeMac(targetMac) });
        return 0;
    }

    private static int RunRestore(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter restore <target_ip> <target_mac> <gateway_ip> <iface> [local_ip]");
            return 1;
        }

        var targetIp = args[1];
        var targetMac = args[2];
        var gatewayIp = args[3];
        var iface = args[4];
        var localIp = args.Length > 5 ? args[5] : "";

        ArpRestore.Run(targetIp, targetMac, gatewayIp, iface, localIp);
        return 0;
    }

    private static int RunPing(string[] args)
    {
        if (args.Length < 2)
        {
            return 1;
        }

        try
        {
            using var ping = new System.Net.NetworkInformation.Ping();
            var reply = ping.Send(args[1], 2000);
            NetworkHelper.EmitJson(new
            {
                type = "ping",
                ip = args[1],
                online = reply.Status == System.Net.NetworkInformation.IPStatus.Success
            });
            return reply.Status == System.Net.NetworkInformation.IPStatus.Success ? 0 : 1;
        }
        catch
        {
            NetworkHelper.EmitJson(new { type = "ping", ip = args[1], online = false });
            return 1;
        }
    }

    private static string[] ParseIpCsv(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static int RunHotspotBlock(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter hotspot-block <client_ips_csv>");
            return 1;
        }

        using var block = new HotspotDivertBlock(ParseIpCsv(args[1]));
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            block.Stop();
        };
        block.RunBlocking();
        return 0;
    }

    private static int RunHotspotLag(string[] args)
    {
        if (args.Length < 3)
        {
            Console.Error.WriteLine("Usage: SkysNativeMeter hotspot-lag <client_ips_csv> <delay_ms> [drop_percent]");
            return 1;
        }

        var delayMs = int.TryParse(args[2], out var ms) ? ms : 150;
        var dropPercent = args.Length > 3 && int.TryParse(args[3], out var dp) ? dp : 0;
        using var lag = new HotspotDivertLag(ParseIpCsv(args[1]), delayMs, dropPercent);
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            lag.Stop();
        };
        lag.RunBlocking();
        return 0;
    }

    private static int RunHotspotPulse(string[] args)
    {
        if (args.Length < 5)
        {
            Console.Error.WriteLine(
                "Usage: SkysNativeMeter hotspot-pulse <client_ips_csv> <freeze_ms> <unfreeze_ms> <count>");
            return 1;
        }

        var freezeMs = int.TryParse(args[2], out var fm) ? fm : 150;
        var unfreezeMs = int.TryParse(args[3], out var um) ? um : 100;
        var count = int.TryParse(args[4], out var c) ? c : 5;
        HotspotDivertPulse.Run(ParseIpCsv(args[1]), freezeMs, unfreezeMs, count);
        return 0;
    }

    private static int RunHotspotCheck(string[] args)
    {
        try
        {
            WinDivertNative.EnsureLoaded();
            var handle = WinDivertNative.WinDivertOpen(
                "false",
                WinDivertNative.WINDIVERT_LAYER.NETWORK,
                0,
                0);
            if (handle == IntPtr.Zero || handle == new IntPtr(-1))
            {
                NetworkHelper.EmitJson(new { type = "windivert", available = false });
                return 1;
            }

            WinDivertNative.WinDivertClose(handle);
            NetworkHelper.EmitJson(new
            {
                type = "windivert",
                available = true,
                path = WinDivertNative.ResolveDir()
            });
            return 0;
        }
        catch (Exception ex)
        {
            NetworkHelper.EmitJson(new { type = "windivert", available = false, message = ex.Message });
            return 1;
        }
    }
}
