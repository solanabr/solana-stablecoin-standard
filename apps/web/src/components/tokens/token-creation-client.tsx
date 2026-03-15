"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Presets } from "@stbr/sss-client";
import { createStablecoinClient } from "@/lib/solana-client";
import { toSdkWallet } from "@/lib/wallet-adapter";
import { env } from "@/lib/env";
import { fetchMintStatus } from "@/lib/mint-status";
import { truncateMiddle } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TxSignatureModal } from "@/components/tokens/tx-signature-modal";
import { toast } from "sonner";
import {
  Plus,
  RefreshCw,
  Snowflake,
  Sun,
  Shield,
  UserMinus,
  UserPlus,
  Gavel,
  AlertCircle,
} from "lucide-react";

const NULL_PUBKEY = "11111111111111111111111111111111";

function getRoleLabel(addr: string) {
  return addr === NULL_PUBKEY ? "—" : truncateMiddle(addr);
}

export function TokenCreationClient() {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const sdkWallet = useMemo(() => toSdkWallet(wallet), [wallet]);
  const client = useMemo(
    () => createStablecoinClient(sdkWallet ?? null),
    [sdkWallet]
  );

  const [mintInput, setMintInput] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    symbol: "",
    uri: "https://",
    decimals: "6",
    preset: Presets.SSS_1,
  });
  const [rolesForm, setRolesForm] = useState({
    pauser: "",
    burner: "",
    blacklister: "",
    seizer: "",
  });
  const [freezeAccount, setFreezeAccount] = useState("");
  const [blacklistWallet, setBlacklistWallet] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");
  const [removeBlacklistWallet, setRemoveBlacklistWallet] = useState("");
  const [seizeForm, setSeizeForm] = useState({
    frozenAccount: "",
    treasuryAccount: "",
    amount: "",
  });
  const [txModal, setTxModal] = useState<{ sig: string; title: string } | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  const mint = useMemo(() => {
    const s = mintInput.trim();
    if (!s) return null;
    try {
      return new PublicKey(s);
    } catch {
      return null;
    }
  }, [mintInput]);
  const hasValidMint = Boolean(mint);

  const {
    data: status,
    isPending: statusLoading,
    isError: statusError,
    error: statusErr,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["mint-status", mint?.toBase58()],
    queryFn: () => fetchMintStatus(mint!.toBase58(), env.rpcUrl),
    enabled: hasValidMint,
    retry: 2,
  });

  const isSss2 = status?.preset === "sss-2";

  async function handleCreateToken() {
    if (!sdkWallet) {
      toast.error("Connect wallet first");
      return;
    }
    setIsCreating(true);
    try {
      const { mint: mintPubkey, signature } =
        await client.createAndGetSignature({
          preset: createForm.preset,
          name: createForm.name,
          symbol: createForm.symbol,
          uri: createForm.uri,
          decimals: parseInt(createForm.decimals, 10),
        });
      toast.success(`Token created: ${mintPubkey.toBase58()}`);
      setMintInput(mintPubkey.toBase58());
      setTxModal({
        sig: signature,
        title: "Token created",
      });
      queryClient.invalidateQueries({ queryKey: ["mint-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create token");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateRoles() {
    if (!sdkWallet || !mint) return;
    const stablecoin = client.getStablecoin(mint);
    try {
      await stablecoin.updateRoles({
        pauser: rolesForm.pauser ? new PublicKey(rolesForm.pauser) : null,
        burner: rolesForm.burner ? new PublicKey(rolesForm.burner) : null,
        blacklister: rolesForm.blacklister
          ? new PublicKey(rolesForm.blacklister)
          : null,
        seizer: rolesForm.seizer ? new PublicKey(rolesForm.seizer) : null,
      });
      toast.success("Roles updated");
      queryClient.invalidateQueries({ queryKey: ["mint-status", mint.toBase58()] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update roles");
    }
  }

  async function handleFreeze() {
    if (!sdkWallet || !mint || !freezeAccount.trim()) return;
    const stablecoin = client.getStablecoin(mint);
    try {
      await stablecoin.compliance.freeze(new PublicKey(freezeAccount.trim()));
      toast.success("Account frozen");
      queryClient.invalidateQueries({ queryKey: ["mint-status", mint.toBase58()] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to freeze");
    }
  }

  async function handleThaw() {
    if (!sdkWallet || !mint || !freezeAccount.trim()) return;
    const stablecoin = client.getStablecoin(mint);
    try {
      await stablecoin.compliance.thaw(new PublicKey(freezeAccount.trim()));
      toast.success("Account thawed");
      queryClient.invalidateQueries({ queryKey: ["mint-status", mint.toBase58()] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to thaw");
    }
  }

  async function handleAddToBlacklist() {
    if (!sdkWallet || !mint || !blacklistWallet.trim() || !blacklistReason.trim())
      return;
    const stablecoin = client.getStablecoin(mint);
    try {
      await stablecoin.compliance.blacklistAdd(
        new PublicKey(blacklistWallet.trim()),
        blacklistReason.trim()
      );
      toast.success("Address blacklisted");
      queryClient.invalidateQueries({ queryKey: ["mint-status", mint.toBase58()] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to blacklist");
    }
  }

  async function handleRemoveFromBlacklist() {
    if (!sdkWallet || !mint || !removeBlacklistWallet.trim()) return;
    const stablecoin = client.getStablecoin(mint);
    try {
      await stablecoin.compliance.blacklistRemove(
        new PublicKey(removeBlacklistWallet.trim())
      );
      toast.success("Address removed from blacklist");
      queryClient.invalidateQueries({ queryKey: ["mint-status", mint.toBase58()] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove from blacklist");
    }
  }

  async function handleSeize() {
    if (
      !sdkWallet ||
      !mint ||
      !seizeForm.frozenAccount.trim() ||
      !seizeForm.treasuryAccount.trim() ||
      !seizeForm.amount.trim()
    )
      return;
    const stablecoin = client.getStablecoin(mint);
    try {
      const fromAcc = await stablecoin.getTokenAccount(
        new PublicKey(seizeForm.frozenAccount.trim())
      );
      const toAcc = await stablecoin.getTokenAccount(
        new PublicKey(seizeForm.treasuryAccount.trim())
      );
      await stablecoin.compliance.seize({
        frozenAccount: new PublicKey(seizeForm.frozenAccount.trim()),
        frozenAccountOwner: fromAcc.owner,
        treasury: new PublicKey(seizeForm.treasuryAccount.trim()),
        treasuryOwner: toAcc.owner,
        amount: BigInt(seizeForm.amount),
      });
      toast.success("Tokens seized");
      queryClient.invalidateQueries({ queryKey: ["mint-status", mint.toBase58()] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to seize");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Token creation</h1>
      </div>

      {/* Token state - FIRST: mint input + config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5" />
            Token state
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">
              Mint address
            </label>
            <Input
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder="Paste mint or create below"
            />
          </div>
          {statusLoading && hasValidMint && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3 animate-pulse">
              <div className="h-6 w-24 bg-muted rounded" />
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="h-5 bg-muted rounded" />
                <div className="h-5 bg-muted rounded" />
              </div>
              <div className="pt-2 border-t space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
              </div>
            </div>
          )}
          {statusError && hasValidMint && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">
                  Failed to load token state
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {statusErr instanceof Error ? statusErr.message : "Unknown error"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => refetchStatus()}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}
          {status && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={status.preset === "sss-2" ? "default" : "secondary"}>
                  {status.preset.toUpperCase()}
                </Badge>
                {status.paused && (
                  <Badge variant="destructive">Paused</Badge>
                )}
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Supply:</span>{" "}
                  {status.supply}
                </p>
                <p>
                  <span className="text-muted-foreground">Total minted:</span>{" "}
                  {status.totalMinted}
                </p>
                <p>
                  <span className="text-muted-foreground">Total burned:</span>{" "}
                  {status.totalBurned}
                </p>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Roles</p>
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Pauser:</span>{" "}
                    {getRoleLabel(status.roles.pauser)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Burner:</span>{" "}
                    {getRoleLabel(status.roles.burner)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Blacklister:</span>{" "}
                    {getRoleLabel(status.roles.blacklister)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Seizer:</span>{" "}
                    {getRoleLabel(status.roles.seizer)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5" />
            Create token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="My Stablecoin"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Input
                value={createForm.symbol}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, symbol: e.target.value }))
                }
                placeholder="MSC"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">URI</label>
            <Input
              value={createForm.uri}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, uri: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Decimals</label>
              <Select
                value={createForm.decimals}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, decimals: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 9, 18].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">Preset</label>
              <Select
                value={createForm.preset}
                onValueChange={(v) =>
                  setCreateForm((f) => ({
                    ...f,
                    preset: v as Presets,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Presets.SSS_1}>SSS-1</SelectItem>
                  <SelectItem value={Presets.SSS_2}>SSS-2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleCreateToken}
            disabled={
              !sdkWallet ||
              !createForm.name ||
              !createForm.symbol ||
              isCreating
            }
          >
            {isCreating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              "Create token"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Update roles - show when mint exists */}
      {hasValidMint && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Update roles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Leave empty to keep current. Use null address to unset.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["pauser", "burner", "blacklister", "seizer"] as const).map(
                (role) => (
                  <div key={role}>
                    <label className="text-xs text-muted-foreground capitalize">
                      {role}
                    </label>
                    <Input
                      value={rolesForm[role]}
                      onChange={(e) =>
                        setRolesForm((f) => ({ ...f, [role]: e.target.value }))
                      }
                      placeholder={
                        status?.roles[role] ?? "Loading…"
                      }
                    />
                  </div>
                )
              )}
            </div>
            <Button
              onClick={handleUpdateRoles}
              disabled={!sdkWallet || !mint}
            >
              Update roles
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Freeze / Thaw - show when mint exists */}
      {hasValidMint && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Snowflake className="h-5 w-5" />
              Freeze / thaw account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">
                Token account address
              </label>
              <Input
                value={freezeAccount}
                onChange={(e) => setFreezeAccount(e.target.value)}
                placeholder="Token account public key"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleFreeze}
                disabled={!sdkWallet || !mint || !freezeAccount.trim()}
              >
                <Snowflake className="h-4 w-4 mr-2" />
                Freeze
              </Button>
              <Button
                variant="outline"
                onClick={handleThaw}
                disabled={!sdkWallet || !mint || !freezeAccount.trim()}
              >
                <Sun className="h-4 w-4 mr-2" />
                Thaw
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance (SSS-2 only) - show when mint exists and SSS-2 */}
      {hasValidMint && isSss2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Compliance (SSS-2)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Add to blacklist
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Wallet address
                  </label>
                  <Input
                    value={blacklistWallet}
                    onChange={(e) => setBlacklistWallet(e.target.value)}
                    placeholder="Public key"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reason</label>
                  <Input
                    value={blacklistReason}
                    onChange={(e) => setBlacklistReason(e.target.value)}
                    placeholder="Reason"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddToBlacklist}
                disabled={
                  !sdkWallet ||
                  !mint ||
                  !blacklistWallet.trim() ||
                  !blacklistReason.trim()
                }
              >
                Add to blacklist
              </Button>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <UserMinus className="h-4 w-4" />
                Remove from blacklist
              </h4>
              <div>
                <label className="text-xs text-muted-foreground">
                  Wallet address
                </label>
                <Input
                  value={removeBlacklistWallet}
                  onChange={(e) => setRemoveBlacklistWallet(e.target.value)}
                  placeholder="Public key"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveFromBlacklist}
                disabled={
                  !sdkWallet || !mint || !removeBlacklistWallet.trim()
                }
              >
                Remove from blacklist
              </Button>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Gavel className="h-4 w-4" />
                Seize tokens
              </h4>
              <p className="text-sm text-muted-foreground">
                Seize from a frozen blacklisted account to treasury.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Source token account (frozen)
                  </label>
                  <Input
                    value={seizeForm.frozenAccount}
                    onChange={(e) =>
                      setSeizeForm((f) => ({
                        ...f,
                        frozenAccount: e.target.value,
                      }))
                    }
                    placeholder="Token account"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Treasury token account
                  </label>
                  <Input
                    value={seizeForm.treasuryAccount}
                    onChange={(e) =>
                      setSeizeForm((f) => ({
                        ...f,
                        treasuryAccount: e.target.value,
                      }))
                    }
                    placeholder="Token account"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <Input
                    value={seizeForm.amount}
                    onChange={(e) =>
                      setSeizeForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    placeholder="Amount (raw units)"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeize}
                disabled={
                  !sdkWallet ||
                  !mint ||
                  !seizeForm.frozenAccount.trim() ||
                  !seizeForm.treasuryAccount.trim() ||
                  !seizeForm.amount.trim()
                }
              >
                Seize
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {txModal && (
        <TxSignatureModal
          open={!!txModal}
          onOpenChange={(open) => !open && setTxModal(null)}
          signature={txModal.sig}
          title={txModal.title}
        />
      )}
    </div>
  );
}
