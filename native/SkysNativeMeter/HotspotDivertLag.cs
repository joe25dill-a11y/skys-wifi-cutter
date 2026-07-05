using System.Collections.Concurrent;

namespace SkysNativeMeter;

internal sealed class HotspotDivertLag : IDisposable
{
    private readonly record struct DelayedPacket(byte[] Data, uint Length, byte[] Addr, long DueAt);

    private readonly HashSet<string> _targets;
    private readonly string _filter;
    private readonly int _delayMs;
    private IntPtr _handle = IntPtr.Zero;
    private volatile bool _running;
    private Thread? _recvThread;
    private Thread? _sendThread;
    private readonly ConcurrentQueue<DelayedPacket> _queue = new();

    public HotspotDivertLag(IEnumerable<string> targetIps, int delayMs)
    {
        _targets = targetIps
            .Where(ip => !string.IsNullOrWhiteSpace(ip))
            .Select(ip => ip.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        _delayMs = Math.Clamp(delayMs, 20, 3000);
        _filter = WinDivertNative.BuildFilter(_targets);
    }

    public void RunBlocking()
    {
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
        _recvThread = new Thread(RecvLoop) { IsBackground = true, Name = "HotspotDivertLagRecv" };
        _sendThread = new Thread(SendLoop) { IsBackground = true, Name = "HotspotDivertLagSend" };
        _recvThread.Start();
        _sendThread.Start();

        NetworkHelper.EmitJson(new
        {
            type = "started",
            mode = "hotspot-lag",
            engine = "windivert",
            delay_ms = _delayMs,
            targets = _targets.ToArray()
        });

        try
        {
            while (_running)
            {
                Thread.Sleep(200);
            }
        }
        catch (ThreadInterruptedException)
        {
            // shutdown
        }
    }

    public void Stop()
    {
        _running = false;
        _recvThread?.Interrupt();
        _sendThread?.Interrupt();
    }

    private void RecvLoop()
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
                    var copy = new byte[readLen];
                    Buffer.BlockCopy(packet, 0, copy, 0, (int)readLen);
                    var addrCopy = new byte[addr.Length];
                    Buffer.BlockCopy(addr, 0, addrCopy, 0, addr.Length);
                    _queue.Enqueue(new DelayedPacket(copy, readLen, addrCopy, Environment.TickCount64 + _delayMs));
                    continue;
                }

                WinDivertNative.WinDivertSend(_handle, packet, readLen, out _, addr);
            }
        }
        catch (ThreadInterruptedException)
        {
            // expected
        }
    }

    private void SendLoop()
    {
        var pending = new List<DelayedPacket>();

        try
        {
            while (_running)
            {
                while (_queue.TryDequeue(out var item))
                {
                    pending.Add(item);
                }

                var now = Environment.TickCount64;
                for (var i = pending.Count - 1; i >= 0; i--)
                {
                    var item = pending[i];
                    if (item.DueAt > now) continue;

                    WinDivertNative.WinDivertSend(_handle, item.Data, item.Length, out _, item.Addr);
                    pending.RemoveAt(i);
                }

                Thread.Sleep(1);
            }
        }
        catch (ThreadInterruptedException)
        {
            // expected
        }
    }

    public void Dispose()
    {
        Stop();
        _recvThread?.Join(1500);
        _sendThread?.Join(1500);
        if (_handle != IntPtr.Zero && _handle != new IntPtr(-1))
        {
            WinDivertNative.WinDivertClose(_handle);
            _handle = IntPtr.Zero;
        }
    }
}
