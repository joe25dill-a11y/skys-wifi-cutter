using System.Text;

namespace SkysNativeMeter;

internal static class DnsHelper
{
    internal static string? ParseQueryDomain(byte[] query)
    {
        if (query.Length < 12) return null;

        var offset = 12;
        var labels = new List<string>();

        while (offset < query.Length)
        {
            var len = query[offset++];
            if (len == 0) break;

            if ((len & 0xC0) != 0)
            {
                break;
            }

            if (offset + len > query.Length) return null;

            labels.Add(Encoding.ASCII.GetString(query, offset, len).ToLowerInvariant());
            offset += len;
        }

        return labels.Count > 0 ? string.Join('.', labels) : null;
    }

    internal static bool DomainMatchesList(string? domain, HashSet<string> domains)
    {
        return ShouldBlock(domain, domains);
    }

    internal static bool IsAllowedInWhitelist(string? domain, HashSet<string> allowedDomains)
    {
        if (string.IsNullOrWhiteSpace(domain)) return false;
        var normalized = domain.Trim().TrimEnd('.').ToLowerInvariant();

        foreach (var suffix in allowedDomains)
        {
            if (string.IsNullOrWhiteSpace(suffix) || suffix == "*") continue;
            var rule = suffix.Trim().TrimEnd('.').ToLowerInvariant();
            if (normalized == rule || normalized.EndsWith("." + rule, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    internal static bool ShouldBlock(string? domain, HashSet<string> blockedDomains)
    {
        if (string.IsNullOrWhiteSpace(domain)) return false;
        if (blockedDomains.Contains("*")) return true;

        var normalized = domain.Trim().TrimEnd('.').ToLowerInvariant();

        foreach (var suffix in blockedDomains)
        {
            if (string.IsNullOrWhiteSpace(suffix) || suffix == "*") continue;

            var rule = suffix.Trim().TrimEnd('.').ToLowerInvariant();
            if (normalized == rule || normalized.EndsWith("." + rule, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    internal static byte[] BuildBlockedDnsResponse(byte[] query)
    {
        if (query.Length < 12) return Array.Empty<byte>();

        var response = new byte[query.Length + 16];
        Buffer.BlockCopy(query, 0, response, 0, query.Length);
        response[2] = 0x81;
        response[3] = 0x83;
        response[6] = 0;
        response[7] = 1;

        var offset = query.Length;
        response[offset++] = 0xC0;
        response[offset++] = 0x0C;
        response[offset++] = 0;
        response[offset++] = 1;
        response[offset++] = 0;
        response[offset++] = 1;
        response[offset++] = 0;
        response[offset++] = 0;
        response[offset++] = 0;
        response[offset++] = 4;
        response[offset++] = 0;
        response[offset++] = 0;
        response[offset++] = 0;
        response[offset++] = 0;

        return response[..offset];
    }
}
