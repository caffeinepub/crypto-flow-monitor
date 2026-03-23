import { Download, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

// Reference both icons so the prune script keeps them in the build
const APP_ICON_512 = "/assets/generated/pwa-icon.dim_512x512.png";
const APP_ICON_192 = "/assets/generated/pwa-icon-192.dim_192x192.png";

// Suppress unused variable warning – both paths must survive the prune step
void APP_ICON_512;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already running as PWA
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    // Remove legacy key
    localStorage.removeItem("pwa-dismissed");

    // Check if user dismissed recently (reset after 7 days)
    const dismissedAt = localStorage.getItem("pwa-dismissed-at");
    if (dismissedAt) {
      const daysSince =
        (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setDismissed(true);
        return;
      }
      // Reset after 7 days so user can be prompted again
      localStorage.removeItem("pwa-dismissed-at");
    }

    // Detect iOS
    const ios =
      /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    if (ios) {
      // Show iOS manual install hint after 3s
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }

    // Check if event was captured globally before this component mounted
    const globalPrompt = (window as any).__pwaInstallEvent;
    if (globalPrompt) {
      (window as any).__pwaInstallEvent = null;
      setDeferredPrompt(globalPrompt as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 2000);
      return;
    }

    // Android / Desktop: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 2000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem("pwa-dismissed-at", String(Date.now()));
  };

  if (isInstalled || dismissed || !show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm"
      >
        <div
          className="rounded-2xl p-4 flex items-start gap-3 shadow-2xl"
          style={{
            background: "rgba(7,11,16,0.97)",
            border: "1px solid rgba(34,211,238,0.3)",
            boxShadow:
              "0 0 30px rgba(34,211,238,0.15), 0 20px 60px rgba(0,0,0,0.8)",
          }}
        >
          <img
            src={APP_ICON_192}
            alt="App icon"
            className="w-12 h-12 rounded-xl shrink-0"
            style={{ border: "1px solid #22D3EE44" }}
          />

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-white mb-0.5">
              Instalar Crypto Flow Monitor
            </p>
            {isIOS ? (
              <p className="text-xs" style={{ color: "#9AA7B6" }}>
                Toque em{" "}
                <span className="font-bold" style={{ color: "#22D3EE" }}>
                  Compartilhar
                </span>{" "}
                e depois{" "}
                <span className="font-bold" style={{ color: "#22D3EE" }}>
                  Adicionar à Tela Inicial
                </span>
              </p>
            ) : (
              <p className="text-xs" style={{ color: "#9AA7B6" }}>
                Instale como app nativo — sem browser, direto na área de
                trabalho
              </p>
            )}

            {!isIOS && (
              <button
                type="button"
                onClick={handleInstall}
                className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                style={{
                  background: "rgba(34,211,238,0.15)",
                  border: "1px solid rgba(34,211,238,0.4)",
                  color: "#22D3EE",
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Instalar agora
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" style={{ color: "#9AA7B6" }} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
