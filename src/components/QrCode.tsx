'use client';
import { useMemo } from 'react';
import QRCode from 'qrcode';

/**
 * Renders a QR code as inline SVG built from the module matrix, so no HTML string is
 * ever injected. The payload is our own join URL, never user text.
 */
export function QrCode({
  value,
  size = 160,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const path = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { d, n };
  }, [value]);
  const quiet = 2;
  const box = path.n + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      role="img"
      aria-label={`QR code for ${value}`}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={box} height={box} fill="#fff" />
      <path d={path.d} fill="#1B2150" transform={`translate(${quiet} ${quiet})`} />
    </svg>
  );
}
