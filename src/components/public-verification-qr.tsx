"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function PublicVerificationQr({ recordId }: { recordId: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const verificationUrl = `${window.location.origin}/verify/${encodeURIComponent(recordId)}`;
    QRCode.toDataURL(verificationUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 144,
      color: { dark: "#0c2922", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setImage(dataUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [recordId]);

  if (failed) return <span className="certificate-qr__fallback">Public link available</span>;
  if (!image) return <span aria-label="Preparing verification QR code" className="certificate-qr__loading" />;

  // The image is generated locally from this app's public verification URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={`QR code for public record ${recordId}`} height={112} src={image} width={112} />;
}
