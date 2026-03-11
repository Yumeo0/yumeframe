import { Clipboard, Loader2, Search } from "lucide-react";
import type { SettingsSection } from "@/components/app/SettingsSidebar";
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
	activeSection: SettingsSection;
	inventoryAutoRefreshEnabled: boolean;
	onInventoryAutoRefreshEnabledChange: (value: boolean) => void;
	inventoryAutoRefreshIntervalSeconds: number;
	onInventoryAutoRefreshIntervalSecondsChange: (value: number) => void;
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
	onRelicOverlayEnabledChange: (value: boolean) => Promise<void>;
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
	activeSection,
	inventoryAutoRefreshEnabled,
	onInventoryAutoRefreshEnabledChange,
	inventoryAutoRefreshIntervalSeconds,
	onInventoryAutoRefreshIntervalSecondsChange,
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
	const showRelicScannerSection = activeSection === "relic-scanner";
	const showInventorySyncSection = activeSection === "inventory-sync";
	const showEeLogPathSection = activeSection === "ee-log-path";
	const showDebugToolsSection = activeSection === "debug-tools";
	const showDataInspectorSection = activeSection === "data-inspector";

	return (
		<div className="flex flex-col min-w-0 gap-2">
			{showRelicScannerSection && (
				<Card>
					<CardHeader>
						<CardTitle>Relic Scanner</CardTitle>
						<CardDescription>
							Controls automatic relic-screen detection and manual scan trigger.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="grid gap-3 md:grid-cols-2">
							<label className="flex items-center justify-between p-3 border rounded">
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
							<label className="flex items-center justify-between p-3 border rounded">
								<div>
									<p className="text-sm font-medium">Enable Overlay</p>
									<p className="text-xs text-muted-foreground">
										Overlay path is optional; in-app scanner tab always updates.
									</p>
								</div>
								<input
									type="checkbox"
									checked={relicOverlayEnabled}
									onChange={(event) => {
										void onRelicOverlayEnabledChange(event.target.checked);
									}}
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
								placeholder="F11"
								className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
							/>
						</div>
						<div className="flex flex-wrap items-center gap-2">
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
			)}

			{showInventorySyncSection && (
				<Card>
					<CardHeader>
						<CardTitle>Inventory Sync</CardTitle>
						<CardDescription>
							Configure automatic inventory refresh timing.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<label className="flex items-center justify-between p-3 border rounded">
							<div>
								<p className="text-sm font-medium">Auto-refresh inventory</p>
								<p className="text-xs text-muted-foreground">
									Automatically fetches inventory data on a timer.
								</p>
							</div>
							<input
								type="checkbox"
								checked={inventoryAutoRefreshEnabled}
								onChange={(event) =>
									onInventoryAutoRefreshEnabledChange(event.target.checked)
								}
							/>
						</label>

						<div className="flex flex-col gap-2">
							<label htmlFor="inventory-refresh-interval" className="text-sm font-medium">
								Refresh interval (seconds)
							</label>
							<input
								id="inventory-refresh-interval"
								type="number"
								min={15}
								step={1}
								value={inventoryAutoRefreshIntervalSeconds}
								disabled={!inventoryAutoRefreshEnabled}
								onChange={(event) => {
									const parsed = Number.parseInt(event.target.value, 10);
									if (Number.isNaN(parsed)) {
										return;
									}
									onInventoryAutoRefreshIntervalSecondsChange(parsed);
								}}
								className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground disabled:opacity-60"
							/>
							<p className="text-xs text-muted-foreground">
								Minimum 15 seconds.
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{showEeLogPathSection && (
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
								className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
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
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Search className="w-4 h-4" />
								)}
								Auto-detect
							</Button>
							<p className="text-xs break-all text-muted-foreground">
								Windows default: %LOCALAPPDATA%\\Warframe\\EE.log
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{showDebugToolsSection && (
				<Card>
					<CardHeader>
						<CardTitle>Debug Tools</CardTitle>
						<CardDescription>
							Low-level tools for scanner testing.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="p-3 border rounded">
							<p className="text-sm font-medium">Relic Reward Image Test</p>
							<p className="text-xs text-muted-foreground">
								Run the relic OCR pipeline against a local screenshot file.
							</p>
							<div className="flex flex-col gap-2 mt-2">
								<input
									type="text"
									value={relicTestImagePath}
									onChange={(event) =>
										onRelicTestImagePathChange(event.target.value)
									}
									placeholder="Path to reward screenshot image"
									className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
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
											<Loader2 className="w-4 h-4 animate-spin" />
										) : null}
										Run image test
									</Button>
								</div>
							</div>
						</div>

						<div className="p-3 border rounded">
							<p className="text-sm font-medium">Scanner OCR Debug</p>
							<p className="text-xs text-muted-foreground">
								Shows each OCR reward token and the top 3 fuzzy-match guesses.
							</p>
							{latestRewardGuessDebug.length > 0 ? (
								<div className="min-w-0 mt-2 space-y-2">
									{latestRewardGuessDebug.map((entry, index) => (
										<div
											key={`${entry.candidate}-${index}`}
											className="min-w-0 p-2 border rounded bg-muted/30"
										>
											<p className="font-mono text-xs text-foreground wrap-break-word">
												OCR: {entry.candidate}
											</p>
											<p className="text-[11px] text-muted-foreground wrap-break-word">
												normalized: {entry.normalizedCandidate || "(empty)"}
											</p>
											<ul className="mt-1 space-y-1 text-[11px] font-mono text-muted-foreground">
												{entry.guesses.map((guess) => (
													<li
														key={`${entry.candidate}-${guess.rewardName}`}
														className="wrap-break-word"
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
									No scanner OCR debug data yet. Run a manual scan, auto scan,
									or image test.
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{showDataInspectorSection && (
				<Card>
					<CardHeader>
						<CardTitle>Data Inspector</CardTitle>
						<CardDescription>
							Raw index and inventory inspection tools.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="p-3 border rounded">
							<p className="mb-2 text-sm font-medium">Asset Index</p>
							{indexLoading && (
								<div className="flex items-center gap-2">
									<Loader2 className="w-4 h-4 animate-spin" />
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
								<Card className="max-w-md min-w-0 p-4 border rounded-lg bg-muted/50">
									<ul className="space-y-2 font-mono text-xs">
										{assets.map((asset) => (
											<li
												key={`${asset.filename}-${asset.hash}`}
												className="flex items-start justify-between min-w-0 gap-2"
											>
												<span className="min-w-0 truncate text-foreground">
													{asset.filename}
												</span>
												<span className="text-right max-w-1/2 text-muted-foreground wrap-break-word">
													{`-> ${asset.hash}`}
												</span>
											</li>
										))}
									</ul>
								</Card>
							)}
						</div>

						<div className="p-3 border rounded">
							<div className="flex flex-wrap items-center justify-between gap-2 mb-2">
								<div>
									<p className="text-sm font-medium">Inventory Data</p>
									<p className="text-xs text-muted-foreground">
										Raw inventory JSON
									</p>
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
										<Clipboard className="w-4 h-4" />
										Copy
									</Button>
								)}
							</div>
							{inventory ? (
								<ScrollArea className="w-full min-w-0 border rounded-lg h-96 bg-muted/50">
									<div className="p-4">
										<pre className="max-w-full font-mono text-xs whitespace-pre-wrap wrap-break-word text-foreground">
											{JSON.stringify(JSON.parse(inventory), null, 2)}
										</pre>
									</div>
								</ScrollArea>
							) : (
								<p className="text-sm text-muted-foreground">
									No inventory loaded. Click Refresh Inventory in the sidebar to load.
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
