using System.Net;
using System.Runtime.InteropServices;

namespace SkysNativeMeter;

internal static class WinDivertNative
{
    private const string DllName = "WinDivert.dll";
    private const int AddressSize = 80;
    private static bool _initialized;

    internal enum WINDIVERT_LAYER : uint
    {
        NETWORK = 0
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetDllDirectory(string lpPathName);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, SetLastError = true)]
    internal static extern IntPtr WinDivertOpen(
        [MarshalAs(UnmanagedType.LPStr)] string filter,
        WINDIVERT_LAYER layer,
        short priority,
        ulong flags);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, SetLastError = true)]
    internal static extern bool WinDivertRecv(
        IntPtr handle,
        byte[] packet,
        uint packetLen,
        out uint recvLen,
        byte[] addr);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, SetLastError = true)]
    internal static extern bool WinDivertSend(
        IntPtr handle,
        byte[] packet,
        uint packetLen,
        out uint sendLen,
        byte[] addr);

    [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
    internal static extern bool WinDivertClose(IntPtr handle);

    internal static int AddressBufferSize => AddressSize;

    internal static void EnsureLoaded()
    {
        if (_initialized) return;

        var dir = ResolveDir();
        if (dir is null)
        {
            throw new DllNotFoundException("WinDivert.dll not found — run npm run bundle:windivert");
        }

        if (!SetDllDirectory(dir))
        {
            throw new InvalidOperationException($"SetDllDirectory failed for {dir}");
        }

        var dllPath = Path.Combine(dir, DllName);
        if (!File.Exists(dllPath))
        {
            throw new FileNotFoundException("WinDivert.dll missing", dllPath);
        }

        if (!File.Exists(Path.Combine(dir, "WinDivert64.sys")))
        {
            throw new FileNotFoundException("WinDivert64.sys missing beside WinDivert.dll", dir);
        }

        if (!NativeLibrary.TryLoad(dllPath, out _))
        {
            throw new DllNotFoundException($"Failed to load {dllPath}");
        }

        _initialized = true;
    }

    internal static string? ResolveDir()
    {
        var fromEnv = Environment.GetEnvironmentVariable("WINDIVERT_PATH");
        if (!string.IsNullOrWhiteSpace(fromEnv) && File.Exists(Path.Combine(fromEnv, DllName)))
        {
            return Path.GetFullPath(fromEnv);
        }

        var baseDir = AppContext.BaseDirectory;
        foreach (var candidate in new[]
                 {
                     baseDir,
                     Path.Combine(baseDir, "windivert"),
                     Path.Combine(baseDir, "..", "windivert"),
                     Path.Combine(baseDir, "..", "..", "runtime", "windivert")
                 })
        {
            var full = Path.GetFullPath(candidate);
            if (File.Exists(Path.Combine(full, DllName)))
            {
                return full;
            }
        }

        return null;
    }

    internal static string BuildFilter(IEnumerable<string> ips)
    {
        var clauses = ips
            .Where(ip => !string.IsNullOrWhiteSpace(ip))
            .Select(ip => $"(ip.SrcAddr == {ip.Trim()} or ip.DstAddr == {ip.Trim()})")
            .ToArray();

        if (clauses.Length == 0)
        {
            throw new ArgumentException("No target IPs for WinDivert filter");
        }

        return clauses.Length == 1 ? $"ip and {clauses[0]}" : $"ip and ({string.Join(" or ", clauses)})";
    }

    internal static bool PacketTouchesIp(ReadOnlySpan<byte> packet, HashSet<string> targets)
    {
        if (packet.Length < 20) return false;
        if ((packet[0] >> 4) != 4) return false;

        var src = new IPAddress(packet.Slice(12, 4)).ToString();
        var dst = new IPAddress(packet.Slice(16, 4)).ToString();
        return targets.Contains(src) || targets.Contains(dst);
    }
}
