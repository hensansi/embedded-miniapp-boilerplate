import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { parseUnits } from "viem";
import { useWallet } from "@/hooks/use-wallet";
import { shortenAddress } from "@/lib/utils";
import {
  fetchAavePosition,
  type AavePosition,
  type AssetPosition,
  type BorrowableAsset,
} from "@/lib/aave";
import { buildBorrowTx, buildRepayTx, MAX_REPAY_AMOUNT } from "@/lib/aave-actions";
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
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
}: {
  options: string[];
  value: string;
  connectedAddress: string;
  onChange: (v: string) => void;
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

  const canSwitch = options.length > 1;
  const label = (addr: string) =>
    addr === connectedAddress ? `${addr} (connected)` : addr;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* address + optional switcher */}
        <button
          onClick={() => canSwitch && setOpen((v) => !v)}
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
            cursor: canSwitch ? "pointer" : "default",
            outline: "none",
            wordBreak: "break-all",
            textAlign: "left",
          }}
        >
          <span>{value}</span>
          {canSwitch && (
            <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
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
  onRepay: () => void;
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
      <OutlineButton onClick={onRepay}>Repay</OutlineButton>
    </div>
  );
}

// ─── Borrowable tile (grid item) ─────────────────────────────────────────────

function BorrowTile({
  asset,
  onBorrow,
}: {
  asset: BorrowableAsset;
  onBorrow: () => void;
}) {
  return (
    <Card style={{ padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <TokenIcon symbol={asset.symbol} />
        <div>
          <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>
            {asset.symbol}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-text)" }}>
            up to {fmtToken(asset.maxAmount, asset.decimals)} EURe
          </div>
        </div>
      </div>
      <ApyBadge apy={asset.apy} />
      <PrimaryButton onClick={onBorrow} style={{ marginTop: 12 }}>
        Borrow
      </PrimaryButton>
    </Card>
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
}: {
  sheet: SheetState | null;
  onClose: () => void;
  onSuccess: () => void;
  walletAddress: string;
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

  const maxDisplay = isRepay
    ? fmtToken((asset as AssetPosition).amount, decimals)
    : fmtToken((asset as BorrowableAsset).maxAmount, decimals);

  const maxEur = isRepay
    ? (asset as AssetPosition).amountEur
    : (asset as BorrowableAsset).maxAmountEur;

  const parsedInput = parseFloat(input) || 0;
  const eurEquiv = isRepay
    ? (parsedInput / (asset as AssetPosition).amount) * (asset as AssetPosition).amountEur
    : (parsedInput / Math.max((asset as BorrowableAsset).maxAmount, 1e-18)) *
      (asset as BorrowableAsset).maxAmountEur;

  function handleMax() {
    setInput(maxDisplay);
    if (isRepay) setIsMax(true);
  }

  function handleInputChange(val: string) {
    setInput(val);
    setIsMax(false);
  }

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
    ? `Current debt: ≈€${fmtEur(maxEur)}`
    : `Max available: ≈€${fmtEur(maxEur)}`;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

        <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 6, paddingLeft: 4 }}>
          ≈ €{fmtEur(isMax ? maxEur : eurEquiv)}
        </div>
      </div>

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
          {submitting ? <Spinner /> : "Confirm"}
        </PrimaryButton>
      </div>
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [ownedSafes, setOwnedSafes] = useState<string[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [position, setPosition] = useState<AavePosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const activeAddress = selectedAddress ?? address;

  useEffect(() => {
    if (!address) return;
    setSelectedAddress(null);

    const BASE = 'https://api.safe.global/tx-service/gno/api/v1';

    async function loadRelatedSafes() {
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Get connected Safe's owners
      const safeInfo = await fetch(`${BASE}/safes/${address}/`)
        .then((r) => r.json()).catch(() => null);
      const owners: string[] = safeInfo?.owners ?? [];

      const candidates = new Set<string>();

      for (const owner of owners) {
        await pause(150);

        // Skip if owner is itself a Safe
        const isSafe = await fetch(`${BASE}/safes/${owner}/`)
          .then((r) => r.ok).catch(() => false);
        if (isSafe) continue;

        await pause(150);

        // Get safes owned by this EOA
        const res = await fetch(`${BASE}/owners/${owner}/safes/`)
          .then((r) => r.json()).catch(() => ({ safes: [] }));
        const safes: string[] = res.safes ?? [];

        // Skip protocol/relayer addresses — a personal passkey owns at most a handful
        if (safes.length > 10) continue;

        for (const s of safes) {
          if (s !== address) candidates.add(s);
        }
      }

      // Keep only addresses registered in the Circles protocol
      const circlesSafes: string[] = [];
      for (const s of candidates) {
        await pause(100);
        const view = await fetch('https://rpc.aboutcircles.com/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'circles_getProfileView', params: [s] }),
        }).then((r) => r.json()).catch(() => null);
        if (view?.result?.avatarInfo) circlesSafes.push(s);
      }

      setOwnedSafes(circlesSafes);
    }

    loadRelatedSafes();
  }, [address]);

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

  useEffect(() => {
    loadPosition();
  }, [loadPosition]);

  const allSafes = address ? [address, ...ownedSafes] : [];

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
                options={allSafes.length ? allSafes : [activeAddress]}
                value={activeAddress}
                connectedAddress={address ?? ""}
                onChange={setSelectedAddress}
              />
            </div>
          )}
        </Card>

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
                  onRepay={() => setSheet({ type: "repay", asset: b })}
                />
              ))
            )}
          </Card>
        </div>

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
                  <OutlineButton onClick={() => setSheet({ type: "borrow", asset: eure })}>Borrow</OutlineButton>
                </div>
              );
            })()}
          </Card>
        </div>
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
            walletAddress={address ?? ""}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
