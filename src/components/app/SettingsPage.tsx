import { Clipboard, FolderOpen, Loader2, Search } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AssetEntry } from "@/types";

interface SettingsPageProps {
	activeSection: SettingsSection;
	use24HourClock: boolean;
	onUse24HourClockChange: (value: boolean) => void;
	craftingTreeShowRecipeDebugNames: boolean;
	onCraftingTreeShowRecipeDebugNamesChange: (value: boolean) => void;
	craftingTreeAutoCollapseAllParts: boolean;
	onCraftingTreeAutoCollapseAllPartsChange: (value: boolean) => void;
	inventoryAutoRefreshEnabled: boolean;
	onInventoryAutoRefreshEnabledChange: (value: boolean) => void;
	inventoryAutoRefreshIntervalSeconds: number;
	onInventoryAutoRefreshIntervalSecondsChange: (value: number) => void;
	indexLoading: boolean;
	error: string;
	assets: AssetEntry[];
	inventory: string;
	eeLogPath: string;
	detectedEeLogPaths: string[];
	eeLogPathPickerWarning: string;
	onEeLogPathChange: (value: string) => void;
	onDetectEeLogPath: () => Promise<string | null>;
	onPickEeLogPath: () => Promise<void>;
	eeLogDetectLoading: boolean;
	relicScannerEnabled: boolean;
	onRelicScannerEnabledChange: (value: boolean) => void;
	relicOverlayEnabled: boolean;
	onRelicOverlayEnabledChange: (value: boolean) => Promise<void>;
	relicScannerHotkey: string;
	onRelicScannerHotkeyChange: (value: string) => void;
	relicScannerAutoDelayMode: "fixed" | "adaptive";
	onRelicScannerAutoDelayModeChange: (value: "fixed" | "adaptive") => void;
	relicScannerAutoFixedDelayMs: number;
	onRelicScannerAutoFixedDelayMsChange: (value: number) => void;
	relicScannerAutoAdaptiveIntervalMs: number;
	onRelicScannerAutoAdaptiveIntervalMsChange: (value: number) => void;
	relicScannerAutoAdaptiveTimeoutMs: number;
	onRelicScannerAutoAdaptiveTimeoutMsChange: (value: number) => void;
	relicScannerAutoDebounceMs: number;
	onRelicScannerAutoDebounceMsChange: (value: number) => void;
	onManualRelicScan: () => Promise<void>;
	relicTestImagePath: string;
	onRelicTestImagePathChange: (value: string) => void;
	onRunRelicImageTest: () => Promise<void>;
	relicTestLogSnippet: string;
	onRelicTestLogSnippetChange: (value: string) => void;
	relicTestForcedPlayerCount: string;
	onRelicTestForcedPlayerCountChange: (value: string) => void;
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
	use24HourClock,
	onUse24HourClockChange,
	craftingTreeShowRecipeDebugNames,
	onCraftingTreeShowRecipeDebugNamesChange,
	craftingTreeAutoCollapseAllParts,
	onCraftingTreeAutoCollapseAllPartsChange,
	inventoryAutoRefreshEnabled,
	onInventoryAutoRefreshEnabledChange,
	inventoryAutoRefreshIntervalSeconds,
	onInventoryAutoRefreshIntervalSecondsChange,
	indexLoading,
	error,
	assets,
	inventory,
	eeLogPath,
	detectedEeLogPaths,
	eeLogPathPickerWarning,
	onEeLogPathChange,
	onDetectEeLogPath,
	onPickEeLogPath,
	eeLogDetectLoading,
	relicScannerEnabled,
	onRelicScannerEnabledChange,
	relicOverlayEnabled,
	onRelicOverlayEnabledChange,
	relicScannerHotkey,
	onRelicScannerHotkeyChange,
	relicScannerAutoDelayMode,
	onRelicScannerAutoDelayModeChange,
	relicScannerAutoFixedDelayMs,
	onRelicScannerAutoFixedDelayMsChange,
	relicScannerAutoAdaptiveIntervalMs,
	onRelicScannerAutoAdaptiveIntervalMsChange,
	relicScannerAutoAdaptiveTimeoutMs,
	onRelicScannerAutoAdaptiveTimeoutMsChange,
	relicScannerAutoDebounceMs,
	onRelicScannerAutoDebounceMsChange,
	onManualRelicScan,
	relicTestImagePath,
	onRelicTestImagePathChange,
	onRunRelicImageTest,
	relicTestLogSnippet,
	onRelicTestLogSnippetChange,
	relicTestForcedPlayerCount,
	onRelicTestForcedPlayerCountChange,
	relicImageTestLoading,
	latestRewardGuessDebug,
}: SettingsPageProps) {
	const showGeneralSection = activeSection === "general";
	const showRelicScannerSection = activeSection === "relic-scanner";
	const showInventorySyncSection = activeSection === "inventory-sync";
	const showEeLogPathSection = activeSection === "ee-log-path";
	const showDebugToolsSection = activeSection === "debug-tools";
	const showDataInspectorSection = activeSection === "data-inspector";

	return (
		<div className="flex flex-col min-w-0 gap-2">
			{showGeneralSection && (
				<Card>
					<CardHeader>
						<CardTitle>General</CardTitle>
						<CardDescription>
							General app preferences.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<label className="flex items-center justify-between p-3 border rounded">
							<div>
								<p className="text-sm font-medium">Use 24-hour clock</p>
								<p className="text-xs text-muted-foreground">
									Used for refresh and completion timestamps.
								</p>
							</div>
							<input
								type="checkbox"
								checked={use24HourClock}
								onChange={(event) =>
									onUse24HourClockChange(event.target.checked)
								}
							/>
						</label>
						<label className="flex items-center justify-between p-3 border rounded">
							<div>
								<p className="text-sm font-medium">Auto-collapse all crafting parts</p>
								<p className="text-xs text-muted-foreground">
									When opening a tree, collapse all subrecipes by default.
								</p>
							</div>
							<input
								type="checkbox"
								checked={craftingTreeAutoCollapseAllParts}
								onChange={(event) =>
									onCraftingTreeAutoCollapseAllPartsChange(event.target.checked)
								}
							/>
						</label>
					</CardContent>
				</Card>
			)}

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
						<div className="grid gap-3 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<Label htmlFor="scanner-auto-delay-mode">Auto delay mode</Label>
								<Select
									value={relicScannerAutoDelayMode}
									onValueChange={(value) =>
										onRelicScannerAutoDelayModeChange(
											value as "fixed" | "adaptive",
										)
									}
								>
									<SelectTrigger id="scanner-auto-delay-mode" className="w-full">
										<SelectValue placeholder="Choose delay mode" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="fixed">Fixed delay</SelectItem>
										<SelectItem value="adaptive">Adaptive loop</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-col gap-2">
								<label htmlFor="scanner-auto-debounce" className="text-sm font-medium">
									Trigger debounce (ms)
								</label>
								<input
									id="scanner-auto-debounce"
									type="number"
									min={100}
									step={50}
									value={relicScannerAutoDebounceMs}
									onChange={(event) => {
										const parsed = Number.parseInt(event.target.value, 10);
										if (Number.isNaN(parsed)) {
											return;
										}
										onRelicScannerAutoDebounceMsChange(parsed);
									}}
									className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
								/>
							</div>
						</div>
						{relicScannerAutoDelayMode === "fixed" ? (
							<div className="flex flex-col gap-2">
								<label htmlFor="scanner-fixed-delay" className="text-sm font-medium">
									Fixed auto delay (ms)
								</label>
								<input
									id="scanner-fixed-delay"
									type="number"
									min={0}
									step={50}
									value={relicScannerAutoFixedDelayMs}
									onChange={(event) => {
										const parsed = Number.parseInt(event.target.value, 10);
										if (Number.isNaN(parsed)) {
											return;
										}
										onRelicScannerAutoFixedDelayMsChange(parsed);
									}}
									className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
								/>
							</div>
						) : (
							<div className="grid gap-3 md:grid-cols-2">
								<div className="flex flex-col gap-2">
									<label htmlFor="scanner-adaptive-interval" className="text-sm font-medium">
										Adaptive interval (ms)
									</label>
									<input
										id="scanner-adaptive-interval"
										type="number"
										min={50}
										step={50}
										value={relicScannerAutoAdaptiveIntervalMs}
										onChange={(event) => {
											const parsed = Number.parseInt(event.target.value, 10);
											if (Number.isNaN(parsed)) {
												return;
											}
											onRelicScannerAutoAdaptiveIntervalMsChange(parsed);
										}}
										className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
									/>
								</div>
								<div className="flex flex-col gap-2">
									<label htmlFor="scanner-adaptive-timeout" className="text-sm font-medium">
										Adaptive timeout (ms)
									</label>
									<input
										id="scanner-adaptive-timeout"
										type="number"
										min={300}
										step={100}
										value={relicScannerAutoAdaptiveTimeoutMs}
										onChange={(event) => {
											const parsed = Number.parseInt(event.target.value, 10);
											if (Number.isNaN(parsed)) {
												return;
											}
											onRelicScannerAutoAdaptiveTimeoutMsChange(parsed);
										}}
										className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
									/>
								</div>
							</div>
						)}
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
							Detected on app start. Select a detected path, browse for one,
							or type manually.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="flex flex-col gap-2">
							<Label htmlFor="ee-log-detected-paths">
								Detected files
							</Label>
							<Select
								value={detectedEeLogPaths.includes(eeLogPath) ? eeLogPath : undefined}
								onValueChange={onEeLogPathChange}
							>
								<SelectTrigger id="ee-log-detected-paths" className="w-full font-mono">
									<SelectValue
										placeholder={
											detectedEeLogPaths.length > 0
												? "Select detected EE.log path"
												: "No detected EE.log files"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{detectedEeLogPaths.map((path) => (
										<SelectItem key={path} value={path} className="font-mono">
											{path}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="ee-log-path">
								Manual path
							</Label>
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
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									void onPickEeLogPath();
								}}
							>
								<FolderOpen className="w-4 h-4" />
								Browse...
							</Button>
						</div>
						{eeLogPathPickerWarning ? (
							<p className="text-xs text-destructive">{eeLogPathPickerWarning}</p>
						) : null}
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
						<label className="flex items-center justify-between p-3 border rounded">
							<div>
								<p className="text-sm font-medium">Show crafting recipe names</p>
								<p className="text-xs text-muted-foreground">
									Displays internal recipe identifiers in the crafting tree.
								</p>
							</div>
							<input
								type="checkbox"
								checked={craftingTreeShowRecipeDebugNames}
								onChange={(event) =>
									onCraftingTreeShowRecipeDebugNamesChange(event.target.checked)
								}
							/>
						</label>

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
								<input
									type="number"
									min={1}
									max={4}
									value={relicTestForcedPlayerCount}
									onChange={(event) =>
										onRelicTestForcedPlayerCountChange(event.target.value)
									}
									placeholder="Force player count hint (1-4)"
									className="w-full px-3 py-2 font-mono text-sm border rounded-md shadow-xs h-9 border-input bg-background text-foreground"
								/>
								<textarea
									value={relicTestLogSnippet}
									onChange={(event) =>
										onRelicTestLogSnippetChange(event.target.value)
									}
									placeholder="Optional: paste EE.log snippet to simulate VoidProjections player detection"
									className="w-full min-h-28 px-3 py-2 font-mono text-xs border rounded-md shadow-xs border-input bg-background text-foreground"
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
