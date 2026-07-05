namespace SkysNativeMeter;

internal sealed class HotspotDivertBlock : IDisposable
{
    private readonly HashSet<string> _targets;
    private readonly string _filter;
    private IntPtr _handle = IntPtr.Zero;
    private volatile bool _running;
    private Thread? _thread;

    public HotspotDivertBlock(IEnumerable<string> targetIps)
    {
        _targets = targetIps
            .Where(ip => !string.IsNullOrWhiteSpace(ip))
            .Select(ip => ip.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (_targets.Count == 0)
        {
            throw new ArgumentException("No hotspot client IPs");
        }

        _filter = WinDivertNative.BuildFilter(_targets);
    }

    public void Start()
    {
        if (_running) return;

        WinDivertNative.EnsureLoaded();
        _handle = WinDivertNative.WinDivertOpen(
            _filter,
            WinDivertNative.WINDIVERT_LAYER.NETWORK,
            0,
            0);

        if (_handle == IntPtr.Zero || _handle == new IntPtr(-1))
        {
            throw new InvalidOperationException("WinDivertOpen failed — run as Administrator");
        }

        _running = true;
        _thread = new Thread(RunLoop)
        {
            IsBackground = true,
            Name = "HotspotDivertBlock"
        };
        _thread.Start();

        NetworkHelper.EmitJson(new
        {
            type = "started",
            mode = "hotspot-block",
            engine = "windivert",
            targets = _targets.ToArray(),
            filter = _filter
        });
    }

    public void RunBlocking()
    {
        Start();
        try
        {
            while (_running)
            {
                Thread.Sleep(200);
            }
        }
        catch (ThreadInterruptedException)
        {
            // shutting down
        }
    }

    public void Stop()
    {
        _running = false;
        _thread?.Interrupt();
    }

    private void RunLoop()
    {
        var packet = new byte[0xFFFF];
        var addr = new byte[WinDivertNative.AddressBufferSize];

        try
        {
            while (_running)
            {
                if (!WinDivertNative.WinDivertRecv(_handle, packet, (uint)packet.Length, out var readLen, addr))
                {
                    Thread.Sleep(1);
                    continue;
                }

                if (WinDivertNative.PacketTouchesIp(packet.AsSpan(0, (int)readLen), _targets))
                {
                    continue;
                }

                WinDivertNative.WinDivertSend(_handle, packet, readLen, out _, addr);
            }
        }
        catch (ThreadInterruptedException)
        {
            // expected on shutdown
        }
        finally
        {
            if (_handle != IntPtr.Zero && _handle != new IntPtr(-1))
            {
                WinDivertNative.WinDivertClose(_handle);
                _handle = IntPtr.Zero;
            }
        }
    }

    public void Dispose()
    {
        Stop();
        _thread?.Join(1500);
        if (_handle != IntPtr.Zero && _handle != new IntPtr(-1))
        {
            WinDivertNative.WinDivertClose(_handle);
            _handle = IntPtr.Zero;
        }
    }
}
