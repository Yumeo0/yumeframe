import { Clipboard, Loader2, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AssetEntry } from "@/types";

interface SettingsPageProps {
	indexLoading: boolean;
	error: string;
	assets: AssetEntry[];
	inventory: string;
	eeLogPath: string;
	onEeLogPathChange: (value: string) => void;
	onDetectEeLogPath: () => Promise<string | null>;
	eeLogDetectLoading: boolean;
	relicScannerEnabled: boolean;
	onRelicScannerEnabledChange: (value: boolean) => void;
	relicOverlayEnabled: boolean;
	onRelicOverlayEnabledChange: (value: boolean) => void;
	relicScannerHotkey: string;
	onRelicScannerHotkeyChange: (value: string) => void;
	onManualRelicScan: () => Promise<void>;
	relicTestImagePath: string;
	onRelicTestImagePathChange: (value: string) => void;
	onRunRelicImageTest: () => Promise<void>;
	relicImageTestLoading: boolean;
	latestRewardGuessDebug: Array<{
		candidate: string;
		normalizedCandidate: string;
		guesses: Array<{
			rewardName: string;
			displayName: string;
			distance: number;
		}>;
	}>;
}

export function SettingsPage({
	indexLoading,
	error,
	assets,
	inventory,
	eeLogPath,
	onEeLogPathChange,
	onDetectEeLogPath,
	eeLogDetectLoading,
	relicScannerEnabled,
	onRelicScannerEnabledChange,
	relicOverlayEnabled,
	onRelicOverlayEnabledChange,
	relicScannerHotkey,
	onRelicScannerHotkeyChange,
	onManualRelicScan,
	relicTestImagePath,
	onRelicTestImagePathChange,
	onRunRelicImageTest,
	relicImageTestLoading,
	latestRewardGuessDebug,
}: SettingsPageProps) {
	return (
		<div className="flex flex-col gap-2">
			<Card>
				<CardHeader>
					<CardTitle>Relic Scanner</CardTitle>
					<CardDescription>
						Controls automatic relic-screen detection and manual scan trigger.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="grid gap-3 md:grid-cols-2">
						<label className="flex items-center justify-between rounded border p-3">
							<div>
								<p className="text-sm font-medium">Enable Scanner</p>
								<p className="text-xs text-muted-foreground">
									Watches EE.log for relic reward events.
								</p>
							</div>
							<input
								type="checkbox"
								checked={relicScannerEnabled}
								onChange={(event) =>
									onRelicScannerEnabledChange(event.target.checked)
								}
							/>
						</label>
						<label className="flex items-center justify-between rounded border p-3">
							<div>
								<p className="text-sm font-medium">Enable Overlay</p>
								<p className="text-xs text-muted-foreground">
									Overlay path is optional; in-app scanner tab always updates.
								</p>
							</div>
							<input
								type="checkbox"
								checked={relicOverlayEnabled}
								onChange={(event) =>
									onRelicOverlayEnabledChange(event.target.checked)
								}
							/>
						</label>
					</div>
					<div className="flex flex-col gap-2">
						<label htmlFor="scanner-hotkey" className="text-sm font-medium">
							Global manual scan hotkey
						</label>
						<input
							id="scanner-hotkey"
							type="text"
							value={relicScannerHotkey}
							onChange={(event) =>
								onRelicScannerHotkeyChange(event.target.value.toUpperCase())
							}
							placeholder="F12"
							className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground shadow-xs"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							onClick={() => {
								void onManualRelicScan();
							}}
						>
							Run manual scan
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>EE.log Path</CardTitle>
					<CardDescription>
						Detected on app start. You can override it manually.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex flex-col gap-2">
						<label htmlFor="ee-log-path" className="text-sm font-medium">
							Path
						</label>
						<input
							id="ee-log-path"
							type="text"
							value={eeLogPath}
							onChange={(event) => onEeLogPathChange(event.target.value)}
							placeholder="Path to EE.log"
							className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground shadow-xs"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => {
								void onDetectEeLogPath();
							}}
							disabled={eeLogDetectLoading}
						>
							{eeLogDetectLoading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Search className="h-4 w-4" />
							)}
							Auto-detect
						</Button>
						<p className="text-xs text-muted-foreground">
							Windows default: %LOCALAPPDATA%\\Warframe\\EE.log
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Debug</CardTitle>
					<CardDescription>
						Low-level tools for scanner testing and raw data inspection.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="rounded border p-3">
						<p className="text-sm font-medium">Relic Reward Image Test</p>
						<p className="text-xs text-muted-foreground">
							Run the relic OCR pipeline against a local screenshot file.
						</p>
						<div className="mt-2 flex flex-col gap-2">
							<input
								type="text"
								value={relicTestImagePath}
								onChange={(event) =>
									onRelicTestImagePathChange(event.target.value)
								}
								placeholder="Path to reward screenshot image"
								className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground shadow-xs"
							/>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={relicImageTestLoading}
									onClick={() => {
										void onRunRelicImageTest();
									}}
								>
									{relicImageTestLoading ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : null}
									Run image test
								</Button>
							</div>
						</div>
					</div>

					<div className="rounded border p-3">
						<p className="text-sm font-medium">Scanner OCR Debug</p>
						<p className="text-xs text-muted-foreground">
							Shows each OCR reward token and the top 3 fuzzy-match guesses.
						</p>
						{latestRewardGuessDebug.length > 0 ? (
							<div className="mt-2 space-y-2">
								{latestRewardGuessDebug.map((entry, index) => (
									<div
										key={`${entry.candidate}-${index}`}
										className="rounded border bg-muted/30 p-2"
									>
										<p className="text-xs font-mono text-foreground">
											OCR: {entry.candidate}
										</p>
										<p className="text-[11px] text-muted-foreground">
											normalized: {entry.normalizedCandidate || "(empty)"}
										</p>
										<ul className="mt-1 space-y-1 text-[11px] font-mono text-muted-foreground">
											{entry.guesses.map((guess) => (
												<li
													key={`${entry.candidate}-${guess.rewardName}`}
													className="truncate"
												>
													{guess.displayName} (dist {guess.distance})
												</li>
											))}
										</ul>
									</div>
								))}
							</div>
						) : (
							<p className="mt-2 text-sm text-muted-foreground">
								No scanner OCR debug data yet. Run a manual scan, auto scan, or image test.
							</p>
						)}
					</div>

					<div className="rounded border p-3">
						<p className="mb-2 text-sm font-medium">Asset Index</p>
						{indexLoading && (
							<div className="flex items-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading asset index...
							</div>
						)}
						{error && !assets.length && (
							<Alert variant="destructive">
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						{assets.length > 0 && (
							<Card className="rounded-lg border bg-muted/50 p-4 max-w-md">
								<ul className="space-y-2 text-xs font-mono">
									{assets.map((asset) => (
										<li
											key={`${asset.filename}-${asset.hash}`}
											className="flex items-center justify-between gap-2"
										>
											<span className="truncate text-foreground">
												{asset.filename}
											</span>
											<span className="text-muted-foreground truncate">
												→&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{asset.hash}
											</span>
										</li>
									))}
								</ul>
							</Card>
						)}
					</div>

					<div className="rounded border p-3">
						<div className="mb-2 flex items-center justify-between">
							<div>
								<p className="text-sm font-medium">Inventory Data</p>
								<p className="text-xs text-muted-foreground">Raw inventory JSON</p>
							</div>
							{inventory && (
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										navigator.clipboard.writeText(
											JSON.stringify(JSON.parse(inventory), null, 2),
										)
									}
									title="Copy to clipboard"
								>
									<Clipboard className="h-4 w-4" />
									Copy
								</Button>
							)}
						</div>
						{inventory ? (
							<ScrollArea className="h-96 w-full rounded-lg border bg-muted/50">
								<div className="p-4">
									<pre className="max-w-full whitespace-pre-wrap wrap-break-word text-xs font-mono text-foreground">
										{JSON.stringify(JSON.parse(inventory), null, 2)}
									</pre>
								</div>
							</ScrollArea>
						) : (
							<p className="text-sm text-muted-foreground">
								No inventory loaded. Click refresh in Foundry to load.
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
