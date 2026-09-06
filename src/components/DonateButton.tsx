import { useState } from "react";

const btnPrimary = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700";
const btnGhost = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800";

interface DonateButtonProps {
  /** Buy Me a Coffee username (e.g., "yourname") */
  bmcUsername?: string;
  /** UPI ID for Indian users (e.g., "name@upi") */
  upiId?: string;
  /** Custom message shown above donation options */
  message?: string;
  /** Show as inline button (for headers) or full card (for pages) */
  variant?: "inline" | "card";
}

/**
 * Donation button component supporting Buy Me a Coffee and UPI QR.
 * LadeStack pattern: shows both international and India-friendly options.
 */
export default function DonateButton({
  bmcUsername = "flashstack",
  upiId = "flashstack@upi",
  message = "FlashStack is free, local-first, and ad-free. If it helps you study, consider a coffee ☕",
  variant = "card",
}: DonateButtonProps) {
  const [showUpi, setShowUpi] = useState(false);
  const [upiQr, setUpiQr] = useState<string | null>(null);

  // Generate UPI QR code on demand
  const generateUpiQr = async () => {
    if (upiQr) return;
    try {
      // Use a free QR code API (no key needed for small images)
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=FlashStack&cu=INR`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUrl)}`;
      setUpiQr(qrApiUrl);
    } catch {
      // Silently fail, user can still copy UPI ID
    }
  };

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2">
        <a
          href={`https://buymeacoffee.com/${bmcUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600 transition"
          aria-label="Buy me a coffee"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.5 3.5c-1.9 0-3.6.8-4.8 2.1-.5-.5-1.1-1-1.7-1-1.9 0-3.6.8-4.8 2.1C3.8 6.4 2 9 2 12.5c0 4.6 4.2 8 9 8s9-3.4 9-8c0-3.5-1.8-6.1-4.5-7.5zM15 13c-1.4 0-2.5-1.1-2.5-2.5S13.6 8 15 8s2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z" />
          </svg>
          <span>Support</span>
        </a>
        <button
          onClick={() => { generateUpiQr(); setShowUpi(true); }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          aria-label="UPI donation"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          <span>UPI</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-1 text-lg font-semibold">Support FlashStack</h3>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>

      <div className="flex flex-wrap gap-4">
        {/* Buy Me a Coffee */}
        <a
          href={`https://buymeacoffee.com/${bmcUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-xl bg-yellow-500 px-6 py-3 font-semibold text-white shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.5 3.5c-1.9 0-3.6.8-4.8 2.1-.5-.5-1.1-1-1.7-1-1.9 0-3.6.8-4.8 2.1C3.8 6.4 2 9 2 12.5c0 4.6 4.2 8 9 8s9-3.4 9-8c0-3.5-1.8-6.1-4.5-7.5zM15 13c-1.4 0-2.5-1.1-2.5-2.5S13.6 8 15 8s2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z" />
          </svg>
          <span>Buy Me a Coffee</span>
        </a>

        {/* UPI QR */}
        <button
          onClick={() => { generateUpiQr(); setShowUpi(true); }}
          className="flex flex-1 min-w-[160px] items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          <span>UPI / QR Code</span>
        </button>
      </div>

      {/* UPI QR Modal */}
      {showUpi && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowUpi(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-semibold">Scan to Pay via UPI</h4>
              <button onClick={() => setShowUpi(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                ✕
              </button>
            </div>

            {upiQr ? (
              <img src={upiQr} alt="UPI QR Code" className="mx-auto mb-4 rounded-lg" width="200" height="200" />
            ) : (
              <div className="mx-auto mb-4 flex h-48 w-48 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <span className="text-slate-500">Generating QR…</span>
              </div>
            )}

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p className="font-medium">UPI ID: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{upiId}</code></p>
              <p>Works with GPay, PhonePe, Paytm, BHIM, any UPI app.</p>
            </div>

            <button
              onClick={() => navigator.clipboard.writeText(upiId)}
              className={btnGhost + " mt-4 w-full"}
            >
              Copy UPI ID
            </button>
          </div>
        </div>
      )}
    </div>
  );
}