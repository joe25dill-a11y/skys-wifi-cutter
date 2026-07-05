using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal static class NetworkHelper
{
    internal static string NormalizeMac(string mac) =>
        mac.Replace('-', ':').ToLowerInvariant();

    internal static PhysicalAddress ParseMac(string mac) =>
        PhysicalAddress.Parse(NormalizeMac(mac).Replace(':', '-'));

    internal static void EnableIpForwarding(string? ifaceName)
    {
        if (string.IsNullOrWhiteSpace(ifaceName)) return;
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "netsh",
                Arguments = $"interface ipv4 set interface \"{ifaceName}\" forwarding=enabled",
                UseShellExecute = false,
                CreateNoWindow = true
            })?.WaitForExit(5000);
        }
        catch
        {
            // optional
        }
    }

    internal static LibPcapLiveDevice ResolveDevice(string ifaceHint, string localIp)
    {
        var devices = CaptureDeviceList.Instance.OfType<LibPcapLiveDevice>().ToList();
        if (devices.Count == 0)
        {
            throw new InvalidOperationException("No Npcap capture devices found");
        }

        if (!string.IsNullOrWhiteSpace(localIp))
        {
            foreach (var dev in devices)
            {
                try
                {
                    var addrs = dev.Addresses;
                    if (addrs != null && addrs.Any(a => a.Addr?.ipAddress?.ToString() == localIp))
                    {
                        return dev;
                    }
                }
                catch
                {
                    // ignore
                }
            }
        }

        var hint = (ifaceHint ?? "").Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(hint))
        {
            var match = devices.FirstOrDefault(d =>
                (d.Name ?? "").Contains(hint, StringComparison.OrdinalIgnoreCase) ||
                (d.Description ?? "").Contains(hint, StringComparison.OrdinalIgnoreCase) ||
                hint.Contains((d.Description ?? "").ToLowerInvariant()));

            if (match != null) return match;

            if (hint.Contains("wi-fi") || hint.Contains("wifi") || hint.Contains("wireless"))
            {
                match = devices.FirstOrDefault(d =>
                    (d.Description ?? "").Contains("wi-fi", StringComparison.OrdinalIgnoreCase) ||
                    (d.Description ?? "").Contains("wireless", StringComparison.OrdinalIgnoreCase));
                if (match != null) return match;
            }

            if (hint.Contains("ethernet"))
            {
                match = devices.FirstOrDefault(d =>
                    (d.Description ?? "").Contains("realtek", StringComparison.OrdinalIgnoreCase) ||
                    (d.Description ?? "").Contains("intel", StringComparison.OrdinalIgnoreCase) ||
                    (d.Description ?? "").Contains("ethernet", StringComparison.OrdinalIgnoreCase));
                if (match != null) return match;
            }
        }

        return devices[0];
    }

    internal static PhysicalAddress GetOurMac(LibPcapLiveDevice device)
    {
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (ni.Name == device.Name || ni.Description == device.Description)
            {
                return ni.GetPhysicalAddress();
            }
        }

        throw new InvalidOperationException($"Could not resolve MAC for adapter {device.Description}");
    }

    internal static PhysicalAddress ResolveMac(string ip, PhysicalAddress fallback)
    {
        try
        {
            var parsed = IPAddress.Parse(ip);
            var bytes = parsed.GetAddressBytes();
            if (parsed.AddressFamily != AddressFamily.InterNetwork || bytes.Length != 4)
            {
                return fallback;
            }

            var dest = (int)BitConverter.ToUInt32(bytes, 0);
            var mac = new byte[6];
            var len = 6u;
            if (SendARP(dest, 0, mac, ref len) == 0 && len >= 6)
            {
                return new PhysicalAddress(mac);
            }
        }
        catch
        {
            // ignore
        }

        return fallback;
    }

    [System.Runtime.InteropServices.DllImport("iphlpapi.dll", ExactSpelling = true)]
    private static extern int SendARP(int destIp, int srcIp, byte[] macAddr, ref uint physicalAddrLen);

    internal static void EmitJson(object payload) =>
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(payload));

    internal static void WarmArp(string ip)
    {
        try
        {
            using var ping = new Ping();
            ping.Send(ip, 1500);
        }
        catch
        {
            // optional
        }

        ResolveMac(ip, PhysicalAddress.Parse("FF-FF-FF-FF-FF-FF"));
    }

    internal static ushort CalculateIpChecksum(ReadOnlySpan<byte> header)
    {
        var length = Math.Min(header.Length, (header[0] & 0x0F) * 4);
        if (length < 20) return 0;

        uint sum = 0;
        for (var i = 0; i < length; i += 2)
        {
            if (i == 10) continue;
            sum += (uint)((header[i] << 8) + header[i + 1]);
        }

        while (sum >> 16 != 0)
        {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }

        return (ushort)~sum;
    }
}
