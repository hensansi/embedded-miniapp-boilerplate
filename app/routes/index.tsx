import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { parseUnits, formatUnits } from "viem";
import { useWallet } from "@/hooks/use-wallet";
import {
  fetchAavePosition,
  fetchErc20Balance,
  type AavePosition,
  type AssetPosition,
  type BorrowableAsset,
} from "@/lib/aave";
import {
  buildBorrowTx,
  buildRepayTx,
  buildErc20TransferTx,
  wrapInExecTransaction,
  MAX_REPAY_AMOUNT,
} from "@/lib/aave-actions";
import { buildQueueDelayTx, buildExecuteDelayTx } from "@/lib/gnosis-card-actions";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtToken(n: number, decimals: number): string {
  const dp = Math.min(decimals, n < 1 ? 6 : n < 1000 ? 4 : 2);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtApy(apy: number): string {
  return apy.toFixed(2) + "%";
}

function fmtEure(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TokenIcon({ symbol }: { symbol: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--accent-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        color: "var(--accent-brand)",
        flexShrink: 0,
      }}
    >
      {symbol[0]}
    </div>
  );
}

function ApyBadge({ apy }: { apy: number }) {
  return (
    <span
      style={{
        background: "var(--accent-soft)",
        color: "var(--accent-brand)",
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 7px",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {fmtApy(apy)} APY
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--muted-text)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function HealthBadge({ hf }: { hf: number }) {
  if (!isFinite(hf)) {
    return (
      <span
        style={{
          background: "#dcfce7",
          color: "#145324",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: "var(--radius-pill)",
        }}
      >
        Safe
      </span>
    );
  }
  const bg = hf >= 2 ? "#dcfce7" : hf >= 1.5 ? "#feebc7" : "#fee2e2";
  const ink = hf >= 2 ? "#145324" : hf >= 1.5 ? "#8a482c" : "#7f1d1d";
  return (
    <span
      style={{
        background: bg,
        color: ink,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--radius-pill)",
      }}
    >
      HF {hf.toFixed(2)}
    </span>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid rgba(255,255,255,0.35)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "linear-gradient(130deg, var(--accent-brand), var(--accent-mid))",
        color: "#fff",
        border: "none",
        borderRadius: "var(--radius-pill)",
        padding: "12px 20px",
        fontSize: 15,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function OutlineButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        color: "var(--accent-brand)",
        border: "2px solid var(--accent-brand)",
        borderRadius: "var(--radius-pill)",
        padding: "6px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Address picker (iframe-safe custom dropdown) ────────────────────────────

function AddressPicker({
  options,
  value,
  connectedAddress,
  onChange,
  onOpen,
  loading,
}: {
  options: string[];
  value: string;
  connectedAddress: string;
  onChange: (v: string) => void;
  onOpen?: () => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const label = (addr: string) =>
    addr === connectedAddress ? `${addr} (connected)` : addr;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* address + optional switcher */}
        <button
          onClick={() => { onOpen?.(); setOpen((v) => !v); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontFamily: "monospace",
            color: value !== connectedAddress ? "var(--accent-brand)" : "var(--muted-text)",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            outline: "none",
            textAlign: "left",
          }}
        >
          <span>{value.slice(0, 6)}…{value.slice(-4)}</span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* copy button */}
        <button
          onClick={handleCopy}
          title="Copy address"
          style={{
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 2,
            color: copied ? "var(--accent-brand)" : "var(--muted-text)",
            display: "flex",
            alignItems: "center",
          }}
        >
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="4.5" y="1" width="7.5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 4.5h2M1 4.5V11.5a1 1 0 001 1h6.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            zIndex: 100,
            overflow: "hidden",
            minWidth: 300,
          }}
        >
          {loading && (
            <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--muted-text)" }}>
              Loading safes…
            </div>
          )}
          {options.map((addr) => (
            <button
              key={addr}
              onClick={() => { onChange(addr); setOpen(false); }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                fontSize: 10,
                fontFamily: "monospace",
                background: addr === value ? "var(--accent-soft)" : "transparent",
                color: addr === value ? "var(--accent-brand)" : "var(--ink)",
                border: "none",
                borderBottom: "1px solid var(--line-soft)",
                cursor: "pointer",
                wordBreak: "break-all",
              }}
            >
              {label(addr)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardAddressCopy({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
      <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--muted-text)" }}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <button
        onClick={handleCopy}
        title="Copy card address"
        style={{ flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", padding: 2, color: copied ? "var(--accent-brand)" : "var(--muted-text)", display: "flex", alignItems: "center" }}
      >
        {copied ? (
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
            <path d="M2 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
            <rect x="4.5" y="1" width="7.5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M1 4.5h2M1 4.5V11.5a1 1 0 001 1h6.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── Borrow row (list item) ──────────────────────────────────────────────────

function BorrowRow({
  asset,
  onRepay,
}: {
  asset: AssetPosition;
  onRepay?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <TokenIcon symbol={asset.symbol} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{asset.symbol}</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>{fmtToken(asset.amount, asset.decimals)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap" }}>≈€{fmtEur(asset.amountEur)} · Aave v3</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <ApyBadge apy={asset.apy} />
            <OutlineButton onClick={onRepay} disabled={!onRepay}>Repay</OutlineButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Borrowable tile (grid item) ─────────────────────────────────────────────

// ─── Tx decoder row ──────────────────────────────────────────────────────────

function TxRow({ label, contract, fn, params }: {
  label: string;
  contract: string;
  fn: string;
  params: { name: string; value: string }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--muted-text)", fontFamily: "monospace", marginBottom: 4, wordBreak: "break-all" }}>
        Contract: {contract}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-text)", marginBottom: 6 }}>
        Function: <span style={{ fontFamily: "monospace" }}>{fn}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {params.map(({ name, value }) => (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 6, fontSize: 10 }}>
            <span style={{ color: "var(--muted-text)" }}>{name}</span>
            <span style={{ fontFamily: "monospace", wordBreak: "break-all", color: "var(--ink)" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Action sheet ────────────────────────────────────────────────────────────

type SheetState =
  | { type: "repay"; asset: AssetPosition }
  | { type: "borrow"; asset: BorrowableAsset };

function ActionSheet({
  sheet,
  onClose,
  onSuccess,
  walletAddress,
  position,
  execViaSafe,
  cardSafeAddress,
}: {
  sheet: SheetState | null;
  onClose: () => void;
  onSuccess: () => void;
  walletAddress: string;
  position: AavePosition | null;
  execViaSafe?: { safe: `0x${string}`; signer: `0x${string}` };
  cardSafeAddress?: string | null;
}) {
  const [input, setInput] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    if (sheet) {
      setInput("");
      setIsMax(false);
      setTxError(null);
    }
  }, [sheet]);

  // Derive values with null-safe guards so they can live before the early return
  // (hooks must not be called conditionally, so useMemo must precede `if (!sheet) return null`)
  const isRepay = sheet?.type === "repay";
  const asset = sheet?.asset ?? null;
  const decimals = asset?.decimals ?? 18;

  const maxRaw = isRepay
    ? (asset as AssetPosition | null)?.amount ?? 0
    : (asset as BorrowableAsset | null)?.maxAmount ?? 0;

  const maxEur = isRepay
    ? (asset as AssetPosition | null)?.amountEur ?? 0
    : (asset as BorrowableAsset | null)?.maxAmountEur ?? 0;

  const parsedInput = parseFloat(input) || 0;
  const eurPerUnit = maxRaw > 0 ? maxEur / maxRaw : 0;
  const eurEquiv = parsedInput * eurPerUnit;
  const canConfirm = (isMax || parsedInput > 0) && !submitting;

  const previewTxs = useMemo((): { to: `0x${string}`; data: `0x${string}` }[] => {
    if (!canConfirm || !asset) return [];
    const addr = walletAddress as `0x${string}`;
    if (isRepay) {
      const amountWei = isMax ? MAX_REPAY_AMOUNT : parseUnits(input, decimals);
      return buildRepayTx((asset as AssetPosition).address, amountWei, addr);
    }
    return buildBorrowTx((asset as BorrowableAsset).address, parseUnits(input, decimals), addr);
  }, [canConfirm, isRepay, isMax, input, decimals, walletAddress, asset]);

  if (!sheet || !asset) return null;

  // Plain decimal string so number inputs parse it correctly (no locale commas)
  function toInputStr(n: number): string {
    const dp = Math.min(decimals, n < 1 ? 6 : n < 1000 ? 4 : 2);
    return n.toFixed(dp);
  }

  function handleMax() {
    setInput(toInputStr(maxRaw));
    setIsMax(true);
  }

  function handleQuick(amount: number) {
    setInput(String(amount));
    setIsMax(false);
  }

  function handleInputChange(val: string) {
    setInput(val);
    setIsMax(false);
  }

  const quickAmounts = [100, 200, 300].filter((v) => v <= maxRaw);

  async function handleConfirm() {
    if (!input && !isMax) return;
    setSubmitting(true);
    setTxError(null);
    try {
      const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
      const addr = walletAddress as `0x${string}`;
      let txs: { to: `0x${string}`; data: `0x${string}` }[];

      if (isRepay) {
        const amountWei = isMax
          ? MAX_REPAY_AMOUNT
          : parseUnits(input, decimals);
        txs = buildRepayTx((asset as AssetPosition).address, amountWei, addr);
      } else {
        const amountWei = parseUnits(input, decimals);
        txs = buildBorrowTx((asset as BorrowableAsset).address, amountWei, addr);
      }

      if (execViaSafe) {
        txs = txs.map((tx) => wrapInExecTransaction(tx, execViaSafe.safe, execViaSafe.signer));
      }

      await sendTransactions(txs);
      onClose();
      onSuccess();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmToCard() {
    if ((!input && !isMax) || !cardSafeAddress || isRepay) return;
    setSubmitting(true);
    setTxError(null);
    try {
      const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
      const addr = walletAddress as `0x${string}`;
      const amountWei = parseUnits(input, decimals);
      const borrowTx = buildBorrowTx((asset as BorrowableAsset).address, amountWei, addr)[0];
      const transferTx = buildErc20TransferTx(
        (asset as BorrowableAsset).address,
        cardSafeAddress as `0x${string}`,
        amountWei,
      );

      let txs: { to: `0x${string}`; data: `0x${string}` }[];
      if (execViaSafe) {
        txs = [
          wrapInExecTransaction(borrowTx, execViaSafe.safe, execViaSafe.signer),
          wrapInExecTransaction(transferTx, execViaSafe.safe, execViaSafe.signer),
        ];
      } else {
        txs = [borrowTx, transferTx];
      }

      await sendTransactions(txs);
      onClose();
      onSuccess();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  const title = isRepay ? `Repay ${asset.symbol}` : `Borrow ${asset.symbol}`;
  const subtitle = isRepay
    ? `Current debt: €${fmtEur(maxEur)}`
    : `Max available: €${fmtEur(maxEur)}`;

  // Projected health factor after this action
  const currentHF = position?.healthFactor ?? Infinity;
  const currentDebtEur = position?.totalDebtEur ?? 0;
  const actionEur = isMax ? maxEur : eurEquiv;
  let projectedHF: number | null = null;
  if (canConfirm && isFinite(currentHF) && currentDebtEur > 0) {
    if (isRepay) {
      const newDebt = Math.max(currentDebtEur - actionEur, 0);
      projectedHF = newDebt < 0.001 ? Infinity : (currentHF * currentDebtEur) / newDebt;
    } else {
      projectedHF = actionEur > 0 ? (currentHF * currentDebtEur) / (currentDebtEur + actionEur) : null;
    }
  }

  return (
    <>
      <SheetHeader style={{ padding: "20px 20px 0" }}>
        <SheetTitle style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
          {title}
        </SheetTitle>
        <SheetDescription style={{ color: "var(--muted-text)", fontSize: 13 }}>
          {subtitle}
        </SheetDescription>
      </SheetHeader>

      <div style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "4px 4px 4px 16px",
          }}
        >
          <input
            type="number"
            min="0"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="0.00"
            style={{
              flex: 1,
              fontSize: 28,
              fontWeight: 600,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              fontFamily: "inherit",
              minWidth: 0,
            }}
          />
          <button
            onClick={handleMax}
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-brand)",
              border: "none",
              borderRadius: "var(--radius-pill)",
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            MAX
          </button>
        </div>

        {quickAmounts.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {quickAmounts.map((v) => (
              <button
                key={v}
                onClick={() => handleQuick(v)}
                style={{
                  flex: 1,
                  background: parsedInput === v && !isMax ? "var(--accent-soft)" : "transparent",
                  color: parsedInput === v && !isMax ? "var(--accent-brand)" : "var(--muted-text)",
                  border: `1px solid ${parsedInput === v && !isMax ? "var(--accent-brand)" : "var(--line)"}`,
                  borderRadius: "var(--radius-pill)",
                  padding: "6px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s, color 0.15s, border-color 0.15s",
                }}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {canConfirm && (
        <div style={{ padding: "0 20px 12px" }}>
          <div
            style={{
              background: "#f8f7ff",
              border: "1px solid var(--accent-soft)",
              borderRadius: 14,
              padding: "14px 16px",
              fontSize: 13,
              color: "var(--ink)",
              lineHeight: 1.7,
            }}
          >
            {/* Action summary row */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: "var(--muted-text)", fontSize: 12 }}>Action</span>
              <span style={{ fontWeight: 700 }}>
                {isRepay ? "Repay" : "Borrow"} {isMax ? fmtToken(maxRaw, decimals) : input} {asset.symbol}
              </span>
            </div>

            {/* EUR value */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ color: "var(--muted-text)", fontSize: 12 }}>Value</span>
              <span style={{ fontWeight: 600 }}>€{fmtEur(isMax ? maxEur : eurEquiv)}</span>
            </div>

            {/* Health factor change */}
            {projectedHF !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color: "var(--muted-text)", fontSize: 12 }}>Health factor</span>
                <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{isFinite(currentHF) ? currentHF.toFixed(2) : "∞"}</span>
                  <span style={{ color: "var(--muted-text)" }}>→</span>
                  <span style={{
                    color: !isFinite(projectedHF) ? "#145324"
                      : projectedHF >= 2 ? "#145324"
                      : projectedHF >= 1.5 ? "#8a482c"
                      : "#7f1d1d",
                  }}>
                    {!isFinite(projectedHF) ? "∞" : projectedHF.toFixed(2)}
                  </span>
                  {isFinite(projectedHF) && projectedHF < 1.5 && (
                    <span style={{ fontSize: 11, color: "#7f1d1d" }}>⚠ risk of liquidation</span>
                  )}
                </span>
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--line)", margin: "10px 0 10px" }} />

            {/* Decoded transactions */}
            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
              {isRepay ? (
                <>
                  <TxRow label="Tx 1 — ERC-20 approve" contract={asset.address} fn="approve(spender, amount)" params={[
                    { name: "spender (Aave Pool)", value: previewTxs[0]?.to ?? "" },
                    { name: "amount", value: isMax ? "max (full debt repayment)" : `${input} ${asset.symbol}` },
                  ]} />
                  <TxRow label="Tx 2 — Aave Pool repay" contract={previewTxs[1]?.to ?? ""} fn="repay(asset, amount, rateMode, onBehalfOf)" params={[
                    { name: "asset", value: `${asset.symbol} (${asset.address})` },
                    { name: "amount", value: isMax ? "max (full debt + accrued interest)" : `${input} ${asset.symbol}` },
                    { name: "onBehalfOf", value: walletAddress },
                  ]} />
                </>
              ) : (
                <TxRow label="Tx 1 — Aave Pool borrow" contract={previewTxs[0]?.to ?? ""} fn="borrow(asset, amount, rateMode, referral, onBehalfOf)" params={[
                  { name: "asset", value: `${asset.symbol} (${asset.address})` },
                  { name: "amount", value: `${input} ${asset.symbol}` },
                  { name: "onBehalfOf", value: walletAddress },
                ]} />
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 20px 24px" }}>
        {txError && (
          <div
            style={{
              background: "#fee2e2",
              color: "#7f1d1d",
              fontSize: 13,
              padding: "10px 14px",
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            {txError}
          </div>
        )}
        {!isRepay ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PrimaryButton onClick={handleConfirm} disabled={!canConfirm}>
              {submitting ? <Spinner /> : "Send to Circles wallet →"}
            </PrimaryButton>
            <PrimaryButton onClick={handleConfirmToCard} disabled={!canConfirm || isMax || !cardSafeAddress}>
              {submitting ? <Spinner /> : "Top up card →"}
            </PrimaryButton>
          </div>
        ) : (
          <PrimaryButton onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? <Spinner /> : "Repay →"}
          </PrimaryButton>
        )}
        {!submitting && canConfirm && (
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted-text)", marginTop: 8 }}>
            Circles will ask you to approve the transaction
          </div>
        )}
      </div>
    </>
  );
}

// ─── Top Up sheet ────────────────────────────────────────────────────────────

function TopUpSheet({
  safeAddress,
  signerAddress,
  eureBalance,
  eureAddress,
  defaultDestination,
  onSuccess,
}: {
  safeAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  eureBalance: bigint;
  eureAddress: `0x${string}`;
  defaultDestination?: string;
  onSuccess: () => void;
}) {
  const [destination, setDestination] = useState(defaultDestination ?? "");
  useEffect(() => {
    setDestination(defaultDestination ?? "");
  }, [defaultDestination]);

  const [cardBalance, setCardBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (!destination.startsWith("0x") || destination.length !== 42) return;
    fetchErc20Balance(eureAddress, destination as `0x${string}`)
      .then(setCardBalance)
      .catch(() => setCardBalance(null));
  }, [destination, eureAddress]);

  const [amount, setAmount] = useState("");
  const [isMax, setIsMax] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const balanceHuman = Number(eureBalance) / 1e18;
  const parsedAmount = parseFloat(amount) || 0;
  const amountWei = isMax ? eureBalance : parseUnits(amount || "0", 18);
  const canConfirm =
    destination.startsWith("0x") &&
    destination.length === 42 &&
    (isMax || parsedAmount > 0) &&
    !submitting;

  function handleMax() {
    setAmount((Math.floor(balanceHuman * 100) / 100).toFixed(2));
    setIsMax(true);
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    setTxError(null);
    try {
      const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
      const inner = buildErc20TransferTx(eureAddress, destination as `0x${string}`, amountWei);
      const tx = wrapInExecTransaction(inner, safeAddress, signerAddress);
      await sendTransactions([tx]);
      onSuccess();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SheetHeader style={{ padding: "20px 20px 0" }}>
        <SheetTitle style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Top Up</SheetTitle>
        <SheetDescription style={{ color: "var(--muted-text)", fontSize: 13 }}>
          Transfer EURe from this safe to another address
        </SheetDescription>
      </SheetHeader>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Destination */}
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 6 }}>Card safe address</div>
          <div style={{
            width: "100%",
            fontSize: 12,
            fontFamily: "monospace",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "10px 14px",
            background: "var(--surface-muted, #f8f8f8)",
            color: "var(--ink)",
            boxSizing: "border-box",
            wordBreak: "break-all",
          }}>
            {destination || "—"}
          </div>
        </div>

        {/* Balances */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: "var(--accent-soft)", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--muted-text)", marginBottom: 2 }}>Card wallet</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {cardBalance !== null ? `€${fmtEure(Number(cardBalance) / 1e18)} EURe` : "…"}
            </div>
          </div>
          <div style={{ flex: 1, background: "var(--accent-soft)", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--muted-text)", marginBottom: 2 }}>Available to send</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              €{fmtEure(balanceHuman)} EURe
            </div>
          </div>
        </div>

        {/* Amount */}
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 6 }}>
            Amount
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--line)", borderRadius: 12, padding: "4px 4px 4px 16px" }}>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setIsMax(false); }}
              placeholder="0.00"
              style={{ flex: 1, fontSize: 28, fontWeight: 600, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontFamily: "inherit", minWidth: 0 }}
            />
            <button
              onClick={handleMax}
              style={{ background: "var(--accent-soft)", color: "var(--accent-brand)", border: "none", borderRadius: "var(--radius-pill)", padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
            >MAX</button>
          </div>
        </div>


        {txError && (
          <div style={{ background: "#fee2e2", color: "#7f1d1d", fontSize: 13, padding: "10px 14px", borderRadius: 10 }}>
            {txError}
          </div>
        )}

        <PrimaryButton onClick={handleConfirm} disabled={!canConfirm} style={{ padding: "14px" }}>
          {submitting ? <Spinner /> : "Confirm Top Up →"}
        </PrimaryButton>
      </div>
    </>
  );
}

// ─── Withdraw sheet (card safe → source safe) ────────────────────────────────

function WithdrawSheet({
  cardSafeAddress,
  signerAddress,
  sourceAddress,
  eureAddress,
  cardBalance,
  onSuccess,
}: {
  cardSafeAddress: `0x${string}`;
  signerAddress: `0x${string}`;
  sourceAddress: `0x${string}`;
  eureAddress: `0x${string}`;
  cardBalance: bigint;
  onSuccess: () => void;
}) {
  const balanceHuman = Number(cardBalance) / 1e18;
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const canConfirm = parsedAmount > 0 && !submitting;

  function handleMax() {
    setAmount((Math.floor(balanceHuman * 100) / 100).toFixed(2));
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    setTxError(null);
    try {
      const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
      const amountWei = parseUnits(amount, 18);
      const transferTx = buildErc20TransferTx(eureAddress, sourceAddress, amountWei);
      const tx = wrapInExecTransaction(transferTx, cardSafeAddress, signerAddress);
      await sendTransactions([tx]);
      onSuccess();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SheetHeader style={{ padding: "20px 20px 0" }}>
        <SheetTitle style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Withdraw from Card</SheetTitle>
        <SheetDescription style={{ color: "var(--muted-text)", fontSize: 13 }}>
          Transfer EURe from card back to source wallet
        </SheetDescription>
      </SheetHeader>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "var(--accent-soft)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--muted-text)", marginBottom: 2 }}>Card balance</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            €{fmtEure(balanceHuman)} EURe
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 6 }}>Amount</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--line)", borderRadius: 12, padding: "4px 4px 4px 16px" }}>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={{ flex: 1, fontSize: 28, fontWeight: 600, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontFamily: "inherit", minWidth: 0 }}
            />
            <button
              onClick={handleMax}
              style={{ background: "var(--accent-soft)", color: "var(--accent-brand)", border: "none", borderRadius: "var(--radius-pill)", padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
            >MAX</button>
          </div>
          {parsedAmount > 0 && !Number.isInteger(parsedAmount * 100) && (
            <button
              onClick={() => setAmount((Math.floor(parsedAmount * 100) / 100).toFixed(2))}
              style={{ marginTop: 6, background: "none", border: "none", color: "var(--accent-brand)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
            >
              Trim to cents → {(Math.floor(parsedAmount * 100) / 100).toFixed(2)}
            </button>
          )}
        </div>

        {txError && (
          <div style={{ background: "#fee2e2", color: "#7f1d1d", fontSize: 13, padding: "10px 14px", borderRadius: 10 }}>
            {txError}
          </div>
        )}

        <PrimaryButton onClick={handleConfirm} disabled={!canConfirm} style={{ padding: "14px" }}>
          {submitting ? <Spinner /> : "Confirm Withdraw →"}
        </PrimaryButton>
      </div>
    </>
  );
}

// ─── Sweep dust button (2-step via Zodiac Delay module) ─────────────────────
// Card safe has no owners — only the Delay module can execute txs from it.
// Step 1: queue the transfer via execTransactionFromModule (connected wallet is enabled module).
// Step 2: after 180s cooldown, execute via executeNextTx with the exact same params.

const SWEEP_COOLDOWN_S = 180;

type SweepPending = { innerTo: string; innerData: string; queuedAt: number };

function SweepViaDelayButton({
  delayModuleAddress,
  eureAddress,
  sourceAddress,
  dustAmount,
  onSuccess,
}: {
  delayModuleAddress: `0x${string}`;
  eureAddress: `0x${string}`;
  sourceAddress: `0x${string}`;
  dustAmount: bigint;
  onSuccess: () => void;
}) {
  const lsKey = `sweep_pending_${delayModuleAddress}`;

  const [pending, setPending] = useState<SweepPending | null>(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) ?? "null"); }
    catch { return null; }
  });
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = pending
    ? Math.max(0, SWEEP_COOLDOWN_S - Math.floor((now - pending.queuedAt * 1000) / 1000))
    : null;
  const canExecute = pending !== null && secondsLeft === 0;

  async function handleQueue() {
    setSubmitting(true);
    try {
      const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
      const innerData = buildErc20TransferTx(eureAddress, sourceAddress, dustAmount).data;
      await sendTransactions([buildQueueDelayTx(delayModuleAddress, eureAddress, innerData)]);
      const entry: SweepPending = { innerTo: eureAddress, innerData, queuedAt: Math.floor(Date.now() / 1000) };
      localStorage.setItem(lsKey, JSON.stringify(entry));
      setPending(entry);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExecute() {
    if (!pending) return;
    setSubmitting(true);
    try {
      const { sendTransactions } = await import("@aboutcircles/miniapp-sdk");
      await sendTransactions([buildExecuteDelayTx(delayModuleAddress, pending.innerTo as `0x${string}`, pending.innerData as `0x${string}`)]);
      localStorage.removeItem(lsKey);
      setPending(null);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  if (pending && secondsLeft! > 0) {
    const m = Math.floor(secondsLeft! / 60);
    const s = secondsLeft! % 60;
    return (
      <OutlineButton disabled style={{ fontSize: 12 }}>
        Execute in {m}:{s.toString().padStart(2, "0")}
      </OutlineButton>
    );
  }

  if (canExecute) {
    return (
      <OutlineButton onClick={handleExecute} disabled={submitting} style={{ fontSize: 12 }}>
        {submitting ? "…" : "Execute Sweep →"}
      </OutlineButton>
    );
  }

  return (
    <OutlineButton onClick={handleQueue} disabled={submitting} style={{ fontSize: 12 }}>
      {submitting ? "…" : `Sweep €${Number(formatUnits(dustAmount, 18)).toFixed(4)} →`}
    </OutlineButton>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [ownedSafes, setOwnedSafes] = useState<string[]>([]);
  const [safesLoading, setSafesLoading] = useState(false);
  const [safesLoaded, setSafesLoaded] = useState(false);
  const safesLoadingRef = useRef(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [position, setPosition] = useState<AavePosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [isOwnerOfSelected, setIsOwnerOfSelected] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [eureWalletBalance, setEureWalletBalance] = useState<bigint | null>(null);
  const [cardSafeAddress, setCardSafeAddress] = useState<string | null>(null);
  const [delayModuleAddress, setDelayModuleAddress] = useState<string | null>(null);
  const [cardSafeBalance, setCardSafeBalance] = useState<bigint | null>(null);

  const activeAddress = selectedAddress ?? address;

  // Reset on wallet change
  useEffect(() => {
    setSelectedAddress(null);
    setOwnedSafes([]);
    setSafesLoaded(false);
    setIsOwnerOfSelected(false);
    setEureWalletBalance(null);
    setCardSafeAddress(null);
    setDelayModuleAddress(null);
    setCardSafeBalance(null);
  }, [address]);

  // Declare callbacks before the effects that reference them (avoids TDZ in the minified bundle)
  const loadSiblingsSafes = useCallback(async () => {
    if (!address || safesLoaded || safesLoadingRef.current) return;
    safesLoadingRef.current = true;
    setSafesLoading(true);
    const BASE = 'https://api.safe.global/tx-service/gno/api/v1';
    try {
      const res = await fetch(`${BASE}/owners/${address}/safes/`)
        .then((r) => r.json()).catch(() => ({ safes: [] }));
      const safes: string[] = (res.safes ?? []).filter((s: string) => s !== address);
      setOwnedSafes(safes);
    } finally {
      safesLoadingRef.current = false;
      setSafesLoading(false);
      setSafesLoaded(true);
    }
  }, [address, safesLoaded]);

  const loadPosition = useCallback(async () => {
    if (!activeAddress) return;
    setLoading(true);
    setFetchError(null);
    try {
      const pos = await fetchAavePosition(activeAddress as `0x${string}`);
      setPosition(pos);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load position");
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  // Eager-load safes as soon as wallet connects
  useEffect(() => {
    loadSiblingsSafes();
  }, [loadSiblingsSafes]);

  // Check if the Circles safe is an owner of the selected sibling safe
  useEffect(() => {
    if (!selectedAddress || selectedAddress === address) {
      setIsOwnerOfSelected(false);
      return;
    }
    fetch(`https://api.safe.global/tx-service/gno/api/v1/safes/${selectedAddress}/`)
      .then((r) => r.json())
      .then((info) => {
        const owners: string[] = info?.owners ?? [];
        setIsOwnerOfSelected(
          owners.some((o) => o.toLowerCase() === address?.toLowerCase()),
        );
      })
      .catch(() => setIsOwnerOfSelected(false));
  }, [selectedAddress, address]);

  useEffect(() => {
    loadPosition();
  }, [loadPosition]);

  // EURe asset — derived from position, memoized to avoid repeated .find() scans
  const eureAsset = useMemo(() => {
    if (!position) return null;
    return (
      position.borrows.find((b) => b.symbol === 'EURe') ??
      position.borrowable.find((b) => b.symbol === 'EURe') ??
      position.supplies.find((b) => b.symbol === 'EURe') ??
      null
    );
  }, [position]);

  const allSafes = useMemo(
    () => (address ? [address, ...ownedSafes] : []),
    [address, ownedSafes],
  );
  // Borrow/repay are available when:
  // - viewing own address, OR
  // - viewing a sibling safe where the Circles safe is an owner (nested execTransaction)
  const canTransact = !selectedAddress || selectedAddress === address || isOwnerOfSelected;

  // Fetch EURe wallet balance of the active safe whenever position or address changes
  useEffect(() => {
    if (!activeAddress || !eureAsset) { setEureWalletBalance(null); return; }
    fetchErc20Balance(eureAsset.address as `0x${string}`, activeAddress as `0x${string}`)
      .then(setEureWalletBalance)
      .catch(() => setEureWalletBalance(null));
  }, [activeAddress, eureAsset]);

  // Discover card safe via HyperIndex: signer EOA → DelayModuleOwner → card safe
  useEffect(() => {
    if (!address) { setCardSafeAddress(null); return; }
    fetch("https://indexer.eu.hyperindex.xyz/00dfbaf/v1/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query payOwners($address: String) {
          Metri_Pay_DelayModuleOwner(where: {ownerAddress: {_eq: $address}}) {
            delayModule { id safeAddress }
          }
        }`,
        variables: { address },
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const entries: { delayModule: { id: string; safeAddress: string } }[] =
          data?.data?.Metri_Pay_DelayModuleOwner ?? [];
        if (entries.length > 0) {
          const last = entries[entries.length - 1].delayModule;
          setCardSafeAddress(last.safeAddress);
          setDelayModuleAddress(last.id);
        }
      })
      .catch(() => {});
  }, [address]);

  // Fetch card safe EURe balance
  useEffect(() => {
    if (!cardSafeAddress || !eureAsset) { setCardSafeBalance(null); return; }
    fetchErc20Balance(eureAsset.address as `0x${string}`, cardSafeAddress as `0x${string}`)
      .then(setCardSafeBalance)
      .catch(() => setCardSafeBalance(null));
  }, [cardSafeAddress, eureAsset]);

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          color: "var(--muted-text)",
          fontSize: 15,
        }}
      >
        Waiting for wallet…
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading && !position) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {[120, 200, 160].map((h) => (
          <div
            key={h}
            style={{
              height: h,
              background: "#ffffff",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-card)",
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div
          style={{
            background: "#fee2e2",
            color: "#7f1d1d",
            padding: "16px 20px",
            borderRadius: "var(--radius-card)",
            fontSize: 14,
          }}
        >
          {fetchError}
        </div>
      </div>
    );
  }

  if (!position) return null;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* ── Hero card ─────────────────────────────────────────────────── */}
        <Card style={{ padding: "24px" }}>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>
            Total Debt
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              lineHeight: 1.1,
            }}
          >
            €{fmtEur(position.totalDebtEur)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <HealthBadge hf={position.healthFactor} />
            <span style={{ fontSize: 13, color: "var(--muted-text)" }}>
              €{fmtEur(position.availableBorrowsEur)} available to borrow
            </span>
          </div>
          {activeAddress && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
              <AddressPicker
                options={allSafes.length ? allSafes : [activeAddress ?? ""]}
                value={activeAddress ?? ""}
                connectedAddress={address ?? ""}
                onChange={setSelectedAddress}
                onOpen={loadSiblingsSafes}
                loading={safesLoading}
              />
            </div>
          )}
        </Card>

        {/* ── Card wallet ───────────────────────────────────────────────── */}
        {isOwnerOfSelected && cardSafeAddress && (
          <div>
            <SectionLabel>Card Wallet</SectionLabel>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
                <TokenIcon symbol="EURe" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>EURe</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>
                      {cardSafeBalance !== null ? `€${fmtEure(Number(cardSafeBalance) / 1e18)}` : "…"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <CardAddressCopy address={cardSafeAddress} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {cardSafeBalance !== null && cardSafeBalance % (10n ** 16n) > 0n && delayModuleAddress && (
                        <SweepViaDelayButton
                          delayModuleAddress={delayModuleAddress as `0x${string}`}
                          eureAddress={eureAsset!.address as `0x${string}`}
                          sourceAddress={selectedAddress as `0x${string}`}
                          dustAmount={cardSafeBalance % (10n ** 16n)}
                          onSuccess={() => { loadPosition(); }}
                        />
                      )}
                      <OutlineButton
                        onClick={() => setWithdrawOpen(true)}
                        disabled={!cardSafeBalance || cardSafeBalance === 0n}
                      >Withdraw</OutlineButton>
                      <OutlineButton
                        onClick={() => setTopupOpen(true)}
                        disabled={!eureWalletBalance || eureWalletBalance === 0n}
                      >Top Up</OutlineButton>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── Available to borrow ───────────────────────────────────────── */}
        <div>
          <SectionLabel>Available to Borrow</SectionLabel>
          <Card>
            {(() => {
              const eure = position.borrowable.find((a) => a.symbol === "EURe");
              if (!eure) return (
                <div style={{ padding: "20px", color: "var(--muted-text)", fontSize: 14, textAlign: "center" }}>
                  Nothing available
                </div>
              );
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
                  <TokenIcon symbol={eure.symbol} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{eure.symbol}</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", flexShrink: 0 }}>{fmtToken(eure.maxAmount, eure.decimals)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--muted-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>≈€{fmtEur(eure.maxAmountEur)} available</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <ApyBadge apy={eure.apy} />
                        <OutlineButton
                          onClick={canTransact ? () => setSheet({ type: "borrow", asset: eure }) : undefined}
                          disabled={!canTransact}
                        >Borrow</OutlineButton>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>

        {/* ── Your borrows ──────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Your Borrows</SectionLabel>
          <Card>
            {position.borrows.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  color: "var(--muted-text)",
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                No open borrows
              </div>
            ) : (
              position.borrows.map((b) => (
                <BorrowRow
                  key={b.address}
                  asset={b}
                  onRepay={canTransact ? () => setSheet({ type: "repay", asset: b }) : undefined}
                />
              ))
            )}
          </Card>
        </div>

        {/* ── Read-only notice ──────────────────────────────────────────── */}
        {selectedAddress && selectedAddress !== address && !isOwnerOfSelected && (
          <div style={{
            background: "#fef9c3",
            border: "1px solid #fde047",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 13,
            color: "#713f12",
            lineHeight: 1.5,
          }}>
            <strong>View only.</strong> Your connected wallet is not an owner of this safe. Switch accounts in the Circles app to transact.
          </div>
        )}
      </div>

      {/* ── Action sheet ──────────────────────────────────────────────────── */}
      <Sheet
        open={sheet !== null}
        onOpenChange={(open: boolean) => { if (!open) setSheet(null); }}
      >
        <SheetContent side="bottom" showCloseButton style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <ActionSheet
            sheet={sheet}
            onClose={() => setSheet(null)}
            onSuccess={loadPosition}
            walletAddress={activeAddress ?? ""}
            position={position}
            execViaSafe={
              isOwnerOfSelected && selectedAddress && address
                ? { safe: selectedAddress as `0x${string}`, signer: address as `0x${string}` }
                : undefined
            }
            cardSafeAddress={cardSafeAddress}
          />
        </SheetContent>
      </Sheet>

      {/* ── Top Up sheet ──────────────────────────────────────────────────── */}
      <Sheet
        open={topupOpen}
        onOpenChange={(open: boolean) => { if (!open) setTopupOpen(false); }}
      >
        <SheetContent side="bottom" showCloseButton>
          {isOwnerOfSelected && selectedAddress && address && eureWalletBalance !== null && eureAsset && (
            <TopUpSheet
              safeAddress={selectedAddress as `0x${string}`}
              signerAddress={address as `0x${string}`}
              eureBalance={eureWalletBalance}
              eureAddress={eureAsset.address as `0x${string}`}
              defaultDestination={cardSafeAddress ?? ""}
              onSuccess={() => { setTopupOpen(false); loadPosition(); }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Withdraw sheet ────────────────────────────────────────────────── */}
      <Sheet
        open={withdrawOpen}
        onOpenChange={(open: boolean) => { if (!open) setWithdrawOpen(false); }}
      >
        <SheetContent side="bottom" showCloseButton>
          {cardSafeAddress && address && selectedAddress && eureAsset && cardSafeBalance !== null && (
            <WithdrawSheet
              cardSafeAddress={cardSafeAddress as `0x${string}`}
              signerAddress={address as `0x${string}`}
              sourceAddress={selectedAddress as `0x${string}`}
              eureAddress={eureAsset.address as `0x${string}`}
              cardBalance={cardSafeBalance}
              onSuccess={() => { setWithdrawOpen(false); loadPosition(); }}
            />
          )}
        </SheetContent>
      </Sheet>

    </>
  );
}
