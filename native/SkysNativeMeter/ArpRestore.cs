using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal static class ArpRestore
{
    internal static void Run(string targetIp, string targetMac, string gatewayIp, string ifaceHint, string localIp)
    {
        var device = NetworkHelper.ResolveDevice(ifaceHint, localIp);
        var targetHw = NetworkHelper.ParseMac(targetMac);
        var gatewayHw = NetworkHelper.ResolveMac(gatewayIp, PhysicalAddress.Parse("FF-FF-FF-FF-FF-FF"));

        device.Open(DeviceModes.Promiscuous, 1000);
        try
        {
            for (var i = 0; i < 4; i++)
            {
                SendReply(
                    device,
                    targetHw,
                    targetHw,
                    IPAddress.Parse(targetIp),
                    gatewayHw,
                    IPAddress.Parse(gatewayIp));

                SendReply(
                    device,
                    gatewayHw,
                    gatewayHw,
                    IPAddress.Parse(gatewayIp),
                    targetHw,
                    IPAddress.Parse(targetIp));

                Thread.Sleep(250);
            }

            NetworkHelper.EmitJson(new
            {
                type = "restored",
                ip = targetIp,
                mac = NetworkHelper.NormalizeMac(targetMac)
            });
        }
        finally
        {
            try { device.Close(); } catch { /* ignore */ }
        }
    }

    private static void SendReply(
        LibPcapLiveDevice device,
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
        device.SendPacket(eth.Bytes);
    }
}
