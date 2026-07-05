using System.Net;
using System.Net.NetworkInformation;
using PacketDotNet;
using SharpPcap.LibPcap;

namespace SkysNativeMeter;

internal static class MitmForwarder
{
    internal static void ForwardIp(LibPcapLiveDevice device, PhysicalAddress ourMac, IPv4Packet ip, PhysicalAddress destMac)
    {
        ForwardIpBytes(device, ourMac, ip.Bytes, destMac);
    }

    internal static void ForwardIpBytes(LibPcapLiveDevice device, PhysicalAddress ourMac, byte[] ipBytes, PhysicalAddress destMac)
    {
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

        var eth = new EthernetPacket(destMac, ourMac, EthernetType.IPv4) { PayloadData = packetBytes };
        eth.UpdateCalculatedValues();
        device.SendPacket(eth.Bytes);
    }

    internal static void SendArpReply(
        LibPcapLiveDevice device,
        PhysicalAddress senderHw,
        PhysicalAddress ethDest,
        PhysicalAddress arpTargetHw,
        IPAddress arpTargetProto,
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
