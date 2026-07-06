import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 120, className }: { value: string; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!value || !ref.current) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    }).catch(() => null);
  }, [value, size]);

  if (!value) return null;

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className={className}
      aria-label="QR code"
      role="img"
    />
  );
}
