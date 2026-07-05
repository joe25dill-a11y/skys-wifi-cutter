namespace SkysNativeMeter;

internal sealed class TokenBucket
{
    private const int UnlimitedKbps = 900_000;
    private readonly bool _unlimited;
    private readonly double _rateBytesPerSec;
    private readonly double _maxBurst;
    private double _tokens;
    private DateTime _last = DateTime.UtcNow;
    private readonly object _lock = new();

    internal TokenBucket(int kbps)
    {
        _unlimited = kbps <= 0 || kbps >= UnlimitedKbps;
        _rateBytesPerSec = Math.Max(0, kbps) * 1024.0 / 8.0;
        _maxBurst = _rateBytesPerSec * 2;
        _tokens = _maxBurst;
    }

    internal bool Allow(int nbytes)
    {
        if (_unlimited) return true;

        lock (_lock)
        {
            var now = DateTime.UtcNow;
            var elapsed = (now - _last).TotalSeconds;
            _last = now;
            _tokens = Math.Min(_maxBurst, _tokens + elapsed * _rateBytesPerSec);
            if (_tokens >= nbytes)
            {
                _tokens -= nbytes;
                return true;
            }

            return false;
        }
    }
}
