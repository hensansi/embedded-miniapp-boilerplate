import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { parseUnits } from "viem";
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
            wordBreak: "break-all",
            textAlign: "left",
          }}
        >
          <span>{value}</span>
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
        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>
          {asset.symbol}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-text)" }}>
          Aave v3
        </div>
      </div>
      <div style={{ textAlign: "right", marginRight: 12 }}>
        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>
          {fmtToken(asset.amount, asset.decimals)}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-text)" }}>
          ≈€{fmtEur(asset.amountEur)}
        </div>
      </div>
      <ApyBadge apy={asset.apy} />
      <OutlineButton onClick={onRepay} disabled={!onRepay}>Repay</OutlineButton>
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
}: {
  sheet: SheetState | null;
  onClose: () => void;
  onSuccess: () => void;
  walletAddress: string;
  position: AavePosition | null;
  execViaSafe?: { safe: `0x${string}`; signer: `0x${string}` };
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

  if (!sheet) return null;

  const isRepay = sheet.type === "repay";
  const asset = sheet.asset;
  const decimals = asset.decimals;

  const maxRaw = isRepay
    ? (asset as AssetPosition).amount
    : (asset as BorrowableAsset).maxAmount;

  const maxEur = isRepay
    ? (asset as AssetPosition).amountEur
    : (asset as BorrowableAsset).maxAmountEur;

  const parsedInput = parseFloat(input) || 0;
  const eurPerUnit = maxRaw > 0 ? maxEur / maxRaw : 0;
  const eurEquiv = parsedInput * eurPerUnit;

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

  const canConfirm = (isMax || parsedInput > 0) && !submitting;
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

  // Build the actual transactions so calldata shown matches exactly what will be submitted
  let previewTxs: { to: `0x${string}`; data: `0x${string}` }[] = [];
  if (canConfirm) {
    const addr = walletAddress as `0x${string}`;
    if (isRepay) {
      const amountWei = isMax ? MAX_REPAY_AMOUNT : parseUnits(input, decimals);
      previewTxs = buildRepayTx((asset as AssetPosition).address, amountWei, addr);
    } else {
      previewTxs = buildBorrowTx((asset as BorrowableAsset).address, parseUnits(input, decimals), addr);
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

            {/* Decoded transactions — parameters we passed when building the txs */}
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
                    { name: "rateMode", value: "2 — variable rate" },
                    { name: "onBehalfOf", value: walletAddress },
                  ]} />
                </>
              ) : (
                <TxRow label="Tx 1 — Aave Pool borrow" contract={previewTxs[0]?.to ?? ""} fn="borrow(asset, amount, rateMode, referral, onBehalfOf)" params={[
                  { name: "asset", value: `${asset.symbol} (${asset.address})` },
                  { name: "amount", value: `${input} ${asset.symbol}` },
                  { name: "rateMode", value: "2 — variable rate" },
                  { name: "referralCode", value: "0" },
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
        <PrimaryButton onClick={handleConfirm} disabled={!canConfirm}>
          {submitting ? <Spinner /> : "Send to Circles wallet →"}
        </PrimaryButton>
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
    const stored = localStorage.getItem("topup_destination");
    if (stored) setDestination(stored);
    else if (defaultDestination) setDestination(defaultDestination);
  }, [defaultDestination]);
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
    localStorage.setItem("topup_destination", destination);
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
          <div style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 6 }}>Destination address</div>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="0x…"
            style={{
              width: "100%",
              fontSize: 12,
              fontFamily: "monospace",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "10px 14px",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Amount */}
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-text)", marginBottom: 6 }}>
            Amount — {fmtToken(balanceHuman, 18)} EURe available
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

        {/* Preview */}
        {canConfirm && (
          <div style={{ background: "#f8f7ff", border: "1px solid var(--accent-soft)", borderRadius: 14, padding: "14px 16px" }}>
            <TxRow
              label="Safe execTransaction → ERC-20 transfer"
              contract={safeAddress}
              fn="execTransaction(to, value, data, operation, …, signatures)"
              params={[
                { name: "inner — token", value: `EURe (${eureAddress})` },
                { name: "inner — to", value: destination },
                { name: "inner — amount", value: isMax ? `${fmtToken(balanceHuman, 18)} EURe (full balance)` : `${amount} EURe` },
              ]}
            />
          </div>
        )}

        {txError && (
          <div style={{ background: "#fee2e2", color: "#7f1d1d", fontSize: 13, padding: "10px 14px", borderRadius: 10 }}>
            {txError}
          </div>
        )}

        <OutlineButton
          onClick={handleConfirm}
          disabled={!canConfirm}
          style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15, fontWeight: 700 }}
        >
          {submitting ? "Sending…" : "Confirm Top Up"}
        </OutlineButton>
      </div>
    </>
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
  const [eureWalletBalance, setEureWalletBalance] = useState<bigint | null>(null);

  const activeAddress = selectedAddress ?? address;

  // Reset on wallet change
  useEffect(() => {
    setSelectedAddress(null);
    setOwnedSafes([]);
    setSafesLoaded(false);
    setIsOwnerOfSelected(false);
    setEureWalletBalance(null);
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

  // Fetch EURe wallet balance of the active safe whenever position or address changes
  useEffect(() => {
    if (!activeAddress || !eureAsset) { setEureWalletBalance(null); return; }
    fetchErc20Balance(eureAsset.address as `0x${string}`, activeAddress as `0x${string}`)
      .then(setEureWalletBalance)
      .catch(() => setEureWalletBalance(null));
  }, [activeAddress, eureAsset]);

  const allSafes = useMemo(
    () => (address ? [address, ...ownedSafes] : []),
    [address, ownedSafes],
  );
  // Borrow/repay are available when:
  // - viewing own address, OR
  // - viewing a sibling safe where the Circles safe is an owner (nested execTransaction)
  const canTransact = !selectedAddress || selectedAddress === address || isOwnerOfSelected;

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
        {[120, 200, 160].map((h, i) => (
          <div
            key={i}
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

        {/* ── Wallet EURe balance ───────────────────────────────────────── */}
        {isOwnerOfSelected && eureWalletBalance !== null && eureWalletBalance > 0n && (
          <div>
            <SectionLabel>Wallet Balance</SectionLabel>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
                <TokenIcon symbol="EURe" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>EURe</div>
                  <div style={{ fontSize: 11, color: "var(--muted-text)" }}>
                    {fmtToken(Number(eureWalletBalance) / 1e18, 18)} EURe in this safe
                  </div>
                </div>
                <OutlineButton onClick={() => setTopupOpen(true)}>Top Up</OutlineButton>
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
                    <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>{eure.symbol}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-text)" }}>up to {fmtToken(eure.maxAmount, eure.decimals)} EURe</div>
                  </div>
                  <ApyBadge apy={eure.apy} />
                  <OutlineButton
                    onClick={canTransact ? () => setSheet({ type: "borrow", asset: eure }) : undefined}
                    disabled={!canTransact}
                  >Borrow</OutlineButton>
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
        <SheetContent side="bottom" showCloseButton>
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
              defaultDestination={address}
              onSuccess={() => { setTopupOpen(false); loadPosition(); }}
            />
          )}
        </SheetContent>
      </Sheet>

    </>
  );
}
