import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Spinner } from "../../../components/ui";
import * as api from "../../../lib/api";
import { channelKeys } from "../hooks";
import { formatChannelPhone } from "../labels";

/** Intervalo de consulta do status enquanto aguarda a leitura do QR. */
const POLL_MS = 3000;
/** O QR do WhatsApp expira em ~20-30 s: busca um novo antes disso. */
const QR_REFRESH_MS = 20_000;
/** Desiste depois disso sem conectar (o usuário pode gerar outro QR). */
const CONNECT_TIMEOUT_MS = 3 * 60_000;
/** Tempo mostrando o sucesso antes de fechar sozinho. */
const SUCCESS_CLOSE_MS = 2500;

type Phase =
  | { kind: "checking" }
  | { kind: "starting" }
  | { kind: "qr"; src: string }
  | { kind: "connected"; phone: string | null; already: boolean }
  | { kind: "expired" }
  | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const qrSrc = (qr: string) => (qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Erro desconhecido");

/**
 * Conecta/reconecta um canal WhatsApp: verifica a sessão ao vivo, reinicia (ou recria)
 * se estiver parada, mostra o QR (renovado automaticamente) e acompanha até conectar.
 */
export function ConnectChannelDialog({
  channel,
  onClose,
}: {
  channel: { id: string; name: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const channelId = channel.id;

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    let qrFetchedAt = 0;
    let restarted = false;

    const refresh = () => {
      void qc.invalidateQueries({ queryKey: channelKeys.list });
      void qc.invalidateQueries({ queryKey: channelKeys.health(channelId) });
    };

    const restart = async () => {
      setPhase({ kind: "starting" });
      restarted = true;
      await api.reconnectChannel(channelId);
      refresh();
      return api.getChannelHealth(channelId);
    };

    const run = async () => {
      try {
        let health = await api.getChannelHealth(channelId);
        const alreadyConnected = health.wahaStatus === "WORKING";

        for (;;) {
          if (cancelled) return;
          const status = health.wahaStatus;

          if (status === null) {
            throw new Error(health.error ?? "Não foi possível falar com o servidor do WhatsApp.");
          }

          if (status === "WORKING") {
            setPhase({
              kind: "connected",
              phone: health.me?.phoneNumber ?? null,
              already: alreadyConnected,
            });
            refresh();
            await sleep(SUCCESS_CLOSE_MS);
            if (!cancelled) onCloseRef.current();
            return;
          }

          if (status === "NOT_FOUND" || status === "STOPPED" || status === "FAILED") {
            if (restarted) {
              throw new Error("A sessão parou antes de conectar. Tente gerar um novo QR.");
            }
            health = await restart();
            continue;
          }

          if (status === "SCAN_QR_CODE" && Date.now() - qrFetchedAt >= QR_REFRESH_MS) {
            try {
              const qr = await api.getChannelQRCode(channelId);
              if (cancelled) return;
              qrFetchedAt = Date.now();
              if (qr.qrCode) setPhase({ kind: "qr", src: qrSrc(qr.qrCode) });
            } catch {
              // QR pode não estar pronto ainda: tenta no próximo ciclo
            }
          } else if (status === "STARTING") {
            setPhase((p) => (p.kind === "qr" ? p : { kind: "starting" }));
          }

          if (Date.now() > deadline) {
            setPhase({ kind: "expired" });
            return;
          }

          await sleep(POLL_MS);
          if (cancelled) return;
          health = await api.getChannelHealth(channelId);
        }
      } catch (error) {
        if (!cancelled) setPhase({ kind: "error", message: errorMessage(error) });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [channelId, attempt, qc]);

  const retry = () => {
    setPhase({ kind: "checking" });
    setAttempt((n) => n + 1);
  };

  const footer =
    phase.kind === "expired" || phase.kind === "error" ? (
      <>
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
        <Button onClick={retry}>{phase.kind === "expired" ? "Gerar novo QR" : "Tentar novamente"}</Button>
      </>
    ) : (
      <Button variant={phase.kind === "connected" ? "primary" : "ghost"} onClick={onClose}>
        {phase.kind === "connected" ? "Concluir" : "Cancelar"}
      </Button>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Conectar ${channel.name}`}
      description="No celular: WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho."
      footer={footer}
    >
      <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
        {(phase.kind === "checking" || phase.kind === "starting") && (
          <>
            <Spinner />
            <p className="text-sm text-fg-muted">
              {phase.kind === "checking" ? "Verificando a sessão..." : "Iniciando a sessão e gerando o QR..."}
            </p>
          </>
        )}

        {phase.kind === "qr" && (
          <>
            <img
              src={phase.src}
              alt="QR code para conectar o WhatsApp"
              className="size-72 rounded-lg border border-line bg-white p-2"
            />
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <Smartphone className="size-4" />
              Escaneie com o WhatsApp do celular. O código se renova sozinho.
            </p>
          </>
        )}

        {phase.kind === "connected" && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-success-50 text-success-600">
              <CheckCircle2 className="size-8" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">
                {phase.already ? "Este WhatsApp já está conectado" : "WhatsApp conectado!"}
              </p>
              {phase.phone && (
                <p className="mt-1 text-sm text-fg-muted">{formatChannelPhone(phase.phone)}</p>
              )}
            </div>
          </>
        )}

        {phase.kind === "expired" && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-warning-50 text-warning-600">
              <AlertTriangle className="size-7" />
            </span>
            <p className="max-w-xs text-sm text-fg-muted">
              O tempo para escanear acabou. Gere um novo QR para tentar de novo.
            </p>
          </>
        )}

        {phase.kind === "error" && (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600">
              <AlertTriangle className="size-7" />
            </span>
            <div className="max-w-sm">
              <p className="text-sm font-semibold text-fg">Não foi possível conectar</p>
              <p className="mt-1 text-sm text-fg-muted">{phase.message}</p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
