"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Download, Smartphone } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallContext = createContext<{
  prompt: InstallPromptEvent | null;
  installed: boolean;
  clearPrompt: () => void;
} | null>(null);

// Mounted in the root layout so the browser event is retained when the
// visitor reaches Settings through client-side navigation.
export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const check = window.setTimeout(() => setInstalled(standalone), 0);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(check);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return <InstallContext.Provider value={{ prompt, installed, clearPrompt: () => setPrompt(null) }}>{children}</InstallContext.Provider>;
}

export function InstallAppCard() {
  const context = useContext(InstallContext);
  const prompt = context?.prompt ?? null;
  const installed = context?.installed ?? false;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    context?.clearPrompt();
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Smartphone className="size-4 text-muted-foreground" />
        ElooFlow na tela inicial
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {installed
          ? "O ElooFlow já está aberto como aplicativo neste dispositivo."
          : "Acesse o ElooFlow pela tela inicial do celular ou computador."}
      </p>
      {!installed && prompt && (
        <button
          type="button"
          onClick={install}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4" />
          Instalar ElooFlow
        </button>
      )}
      {!installed && !prompt && (
        <p className="mt-3 text-sm text-muted-foreground">
          No iPhone ou iPad, abra no Safari e toque em Compartilhar → Adicionar à Tela de Início.
          No Android, abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial.
        </p>
      )}
    </div>
  );
}
