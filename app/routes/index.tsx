import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useWallet } from "@/hooks/use-wallet";
import type { Web3WalletTypes } from "@walletconnect/web3wallet";
import type { WCWallet } from "@/lib/wc";

export const Route = createFileRoute("/")({
  component: WalletConnectPage,
});

// ── Types ─────────────────────────────────────────────────────────

type Session = Awaited<ReturnType<WCWallet["approveSession"]>>;

type AppState =
  | { phase: "idle" }
  | { phase: "pairing" }
  | { phase: "proposal"; proposal: Web3WalletTypes.SessionProposal }
  | { phase: "session"; session: Session }
  | { phase: "request"; session: Session; event: Web3WalletTypes.SessionRequest };

type LastAction = {
  label: string;
  txHash?: string;
  timestamp: number;
};

// ── Helpers ───────────────────────────────────────────────────────

function truncateAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function hexToUtf8(hex: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

// ── Styles ────────────────────────────────────────────────────────

const container: CSSProperties = {
  maxWidth: 400,
  margin: "0 auto",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  padding: "28px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

function primaryBtn(disabled = false): CSSProperties {
  return {
    background: "linear-gradient(130deg, var(--c-accent), var(--c-accent-mid))",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-pill)",
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: "100%",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

function outlineBtn(disabled = false): CSSProperties {
  return {
    background: "transparent",
    color: "var(--c-accent)",
    border: "2px solid var(--c-accent)",
    borderRadius: "var(--radius-pill)",
    padding: "12px 28px",
    fontSize: 15,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: "100%",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  };
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted-c)",
};

const mutedText: CSSProperties = { fontSize: 13, color: "var(--muted-c)" };
const errorText: CSSProperties = { fontSize: 13, color: "var(--error-ink)" };

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm-c)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "#fff",
  color: "var(--ink)",
  boxSizing: "border-box",
  outline: "none",
};

// ── Sub-components ────────────────────────────────────────────────

function DAppIcon({
  icons,
  name,
  size = 32,
}: {
  icons: string[];
  name: string;
  size?: number;
}) {
  if (icons[0]) {
    return (
      <img
        src={icons[0]}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        color: "var(--c-accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.45),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: `2px solid ${light ? "rgba(255,255,255,0.35)" : "rgba(14,0,168,0.2)"}`,
        borderTopColor: light ? "#fff" : "var(--c-accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────

function WalletConnectPage() {
  const { address, isConnected } = useWallet();
  const [state, setState] = useState<AppState>({ phase: "idle" });
  const [pasteUri, setPasteUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const wcRef = useRef<WCWallet | null>(null);
  const initializedRef = useRef(false);

  // Init WalletConnect once on first wallet connection
  useEffect(() => {
    if (!address || initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      try {
        const { initWallet } = await import("@/lib/wc");
        const wc = await initWallet();
        wcRef.current = wc;

        const sessions = Object.values(wc.getActiveSessions());
        if (sessions.length > 0) {
          setState({ phase: "session", session: sessions[0] });
        }

        wc.on("session_proposal", (proposal) => {
          setState({ phase: "proposal", proposal });
        });

        wc.on("session_request", (event) => {
          const s = Object.values(wcRef.current!.getActiveSessions()).find(
            (s) => s.topic === event.topic,
          );
          if (s) setState({ phase: "request", session: s, event });
        });

        wc.on("session_delete", () => {
          setState({ phase: "idle" });
        });
      } catch (err) {
        console.error("[wc] init failed:", err);
      }
    })();
  }, [address]);

  // ── Handlers ──────────────────────────────────────────────────────

  function handleConnectUri(uri: string) {
    const trimmed = uri.trim();
    if (!trimmed.startsWith("wc:")) {
      setError("Invalid URI. Must start with wc:");
      return;
    }
    setError(null);
    setPasteUri("");
    setState({ phase: "pairing" });
    wcRef.current!.core.pairing.pair({ uri: trimmed }).catch((err) => {
      console.error("[wc] pairing failed:", err);
      setError("Pairing failed. Try again.");
      setState({ phase: "idle" });
    });
  }

  async function handleApproveProposal() {
    if (state.phase !== "proposal" || !address || !wcRef.current) return;
    setApproving(true);
    setError(null);
    try {
      const namespaces = {
        eip155: {
          chains: ["eip155:100"],
          methods: [
            "eth_sendTransaction",
            "personal_sign",
            "eth_signTypedData",
            "eth_signTypedData_v4",
          ],
          events: ["chainChanged", "accountsChanged"],
          accounts: [`eip155:100:${address}`],
        },
      };
      const session = await wcRef.current.approveSession({
        id: state.proposal.id,
        namespaces,
      });
      setState({ phase: "session", session });
    } catch (err) {
      console.error("[wc] approve session failed:", err);
      setError("Failed to approve session.");
    } finally {
      setApproving(false);
    }
  }

  async function handleRejectProposal() {
    if (state.phase !== "proposal" || !wcRef.current) return;
    await wcRef.current.rejectSession({
      id: state.proposal.id,
      reason: { code: 4001, message: "User rejected" },
    });
    setState({ phase: "idle" });
  }

  async function handleApproveRequest() {
    if (state.phase !== "request" || !wcRef.current) return;
    const { event, session } = state;
    setApproving(true);
    setError(null);
    try {
      const method = event.params.request.method;
      let result: string;
      let action: LastAction;

      if (method === "eth_sendTransaction") {
        const tx = event.params.request.params[0] as {
          to: string;
          data?: string;
          value?: string;
        };
        const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
        const [txHash] = await sendTransactions([
          { to: tx.to, data: tx.data ?? "0x", value: tx.value ?? "0x0" },
        ]);
        result = txHash;
        action = { label: "Transaction sent", txHash, timestamp: Date.now() };
      } else if (method === "personal_sign") {
        const hexMsg = event.params.request.params[0] as string;
        const message = hexMsg.startsWith("0x") ? hexToUtf8(hexMsg) : hexMsg;
        const { signMessage } = await import("@aboutcircles/miniapp-sdk");
        const { signature } = await signMessage(message, "erc1271");
        result = signature;
        action = { label: "Message signed", timestamp: Date.now() };
      } else if (
        method === "eth_signTypedData" ||
        method === "eth_signTypedData_v4"
      ) {
        const typedDataJson = event.params.request.params[1] as string;
        const { signMessage } = await import("@aboutcircles/miniapp-sdk");
        const { signature } = await signMessage(typedDataJson, "raw");
        result = signature;
        action = { label: "Typed data signed", timestamp: Date.now() };
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      await wcRef.current.respondSessionRequest({
        topic: event.topic,
        response: { id: event.id, jsonrpc: "2.0", result },
      });
      setLastAction(action!);
      setState({ phase: "session", session });
    } catch (err) {
      console.error("[wc] request failed:", err);
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setApproving(false);
    }
  }

  async function handleRejectRequest() {
    if (state.phase !== "request" || !wcRef.current) return;
    const { event, session } = state;
    await wcRef.current.respondSessionRequest({
      topic: event.topic,
      response: {
        id: event.id,
        jsonrpc: "2.0",
        error: { code: 4001, message: "User rejected the request" },
      },
    });
    setState({ phase: "session", session });
  }

  async function handleDisconnect() {
    if (state.phase !== "session" || !wcRef.current) return;
    await wcRef.current.disconnectSession({
      topic: state.session.topic,
      reason: { code: 6000, message: "User disconnected" },
    });
    setLastAction(null);
    setState({ phase: "idle" });
  }

  // ── Not connected ──────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div style={container}>
        <div
          style={{
            ...card,
            alignItems: "center",
            justifyContent: "center",
            minHeight: 200,
            textAlign: "center",
          }}
        >
          <p style={mutedText}>Open in Circles to connect</p>
        </div>
      </div>
    );
  }

  // ── Idle ──────────────────────────────────────────────────────────

  if (state.phase === "idle") {
    return (
      <div style={container}>
        <div style={card}>
          <span style={sectionLabel}>Connect a dApp</span>
          {error && <p style={errorText}>{error}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              style={inputStyle}
              type="text"
              placeholder="wc:…"
              value={pasteUri}
              onChange={(e) => setPasteUri(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && pasteUri.trim() && handleConnectUri(pasteUri)
              }
              autoFocus
            />
            <button
              style={primaryBtn(!pasteUri.trim())}
              disabled={!pasteUri.trim()}
              onClick={() => handleConnectUri(pasteUri)}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pairing ───────────────────────────────────────────────────────

  if (state.phase === "pairing") {
    return (
      <div style={container}>
        <div
          style={{
            ...card,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            minHeight: 120,
          }}
        >
          <Spinner />
          <p style={mutedText}>Connecting…</p>
        </div>
      </div>
    );
  }

  // ── Proposal ──────────────────────────────────────────────────────

  if (state.phase === "proposal") {
    const meta = state.proposal.params.proposer.metadata;
    return (
      <div style={container}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DAppIcon icons={meta.icons} name={meta.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: 0 }}>
                {meta.name}
              </p>
              <p
                style={{
                  ...mutedText,
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {meta.url}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={sectionLabel}>Chain</span>
            <span style={{ fontSize: 14, color: "var(--ink)" }}>Gnosis Chain</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={sectionLabel}>Your Safe</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{ fontSize: 13, fontFamily: "monospace", color: "var(--ink)" }}
              >
                {address ? truncateAddr(address) : "—"}
              </span>
              <button
                onClick={() => address && navigator.clipboard.writeText(address)}
                style={{
                  background: "var(--line-soft)",
                  border: "none",
                  borderRadius: "var(--radius-sm-c)",
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "var(--muted-c)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                copy
              </button>
            </div>
          </div>

          {error && <p style={errorText}>{error}</p>}

          <button
            style={primaryBtn(approving)}
            disabled={approving}
            onClick={handleApproveProposal}
          >
            {approving ? <Spinner light /> : "Approve"}
          </button>
          <button
            style={outlineBtn(approving)}
            disabled={approving}
            onClick={handleRejectProposal}
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  // ── Session ───────────────────────────────────────────────────────

  if (state.phase === "session") {
    const meta = state.session.peer.metadata;
    return (
      <div style={container}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DAppIcon icons={meta.icons} name={meta.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: 0 }}>
                {meta.name}
              </p>
              <span
                style={{
                  fontSize: 11,
                  background: "var(--accent-soft)",
                  color: "var(--c-accent)",
                  padding: "1px 7px",
                  borderRadius: "var(--radius-pill)",
                  display: "inline-block",
                }}
              >
                {meta.url.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </div>

          {lastAction ? (
            <div
              style={{
                background: "var(--accent-soft)",
                borderRadius: "var(--radius-sm-c)",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ ...sectionLabel, color: "var(--c-accent)" }}>
                Last action
              </span>
              <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                {lastAction.label}
              </span>
              {lastAction.txHash && (
                <a
                  href={`https://gnosisscan.io/tx/${lastAction.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "var(--c-accent)",
                    textDecoration: "underline",
                  }}
                >
                  {truncateAddr(lastAction.txHash)} ↗
                </a>
              )}
            </div>
          ) : (
            <p
              style={{
                ...mutedText,
                textAlign: "center",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              Waiting for request…
            </p>
          )}

          <div style={{ textAlign: "right" }}>
            <button
              onClick={handleDisconnect}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted-c)",
                cursor: "pointer",
                fontSize: 13,
                textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Request ───────────────────────────────────────────────────────

  if (state.phase === "request") {
    const { event, session } = state;
    const method = event.params.request.method;
    const meta = session.peer.metadata;

    let badgeLabel = "Unknown Request";
    let details: React.ReactNode = null;

    if (method === "eth_sendTransaction") {
      badgeLabel = "Send Transaction";
      const tx = event.params.request.params[0] as {
        to: string;
        value?: string;
        data?: string;
      };
      const valueWei = BigInt(tx.value ?? "0x0");
      const valueEth = (Number(valueWei) / 1e18).toFixed(6);
      const dataStr = tx.data ?? "0x";
      details = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <span style={sectionLabel}>To</span>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                fontFamily: "monospace",
                color: "var(--ink)",
                wordBreak: "break-all",
              }}
            >
              {tx.to}
            </p>
          </div>
          <div>
            <span style={sectionLabel}>Value</span>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink)" }}>
              {valueEth} ETH
            </p>
          </div>
          <div>
            <span style={sectionLabel}>Data</span>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                fontFamily: "monospace",
                color: "var(--muted-c)",
                wordBreak: "break-all",
              }}
            >
              {dataStr.length > 22 ? dataStr.slice(0, 20) + "…" : dataStr}
            </p>
          </div>
        </div>
      );
    } else if (method === "personal_sign") {
      badgeLabel = "Sign Message";
      const hexMsg = event.params.request.params[0] as string;
      const message = hexMsg.startsWith("0x") ? hexToUtf8(hexMsg) : hexMsg;
      details = (
        <div>
          <span style={sectionLabel}>Message</span>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--ink)",
              maxHeight: 120,
              overflowY: "auto",
              wordBreak: "break-word",
              background: "var(--line-soft)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm-c)",
            }}
          >
            {message}
          </p>
        </div>
      );
    } else if (
      method === "eth_signTypedData" ||
      method === "eth_signTypedData_v4"
    ) {
      badgeLabel = "Sign Typed Data";
      const jsonStr = event.params.request.params[1] as string;
      let domain = "";
      let primaryType = "";
      try {
        const parsed = JSON.parse(jsonStr) as {
          domain?: { name?: string };
          primaryType?: string;
        };
        domain = parsed.domain?.name ?? "";
        primaryType = parsed.primaryType ?? "";
      } catch {
        /* ignore parse errors */
      }
      details = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {primaryType && (
            <div>
              <span style={sectionLabel}>Type</span>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink)" }}>
                {primaryType}
              </p>
            </div>
          )}
          {domain && (
            <div>
              <span style={sectionLabel}>Domain</span>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink)" }}>
                {domain}
              </p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={container}>
        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                background: "var(--accent-soft)",
                color: "var(--c-accent)",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "var(--radius-pill)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}
            >
              {badgeLabel}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <DAppIcon icons={meta.icons} name={meta.name} size={22} />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--muted-c)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {meta.name}
              </span>
            </div>
          </div>

          {details}

          {error && <p style={errorText}>{error}</p>}

          <button
            style={primaryBtn(approving)}
            disabled={approving}
            onClick={handleApproveRequest}
          >
            {approving ? <Spinner light /> : "Approve"}
          </button>
          <button
            style={outlineBtn(approving)}
            disabled={approving}
            onClick={handleRejectRequest}
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  return null;
}
