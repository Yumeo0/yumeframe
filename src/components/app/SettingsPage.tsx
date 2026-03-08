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
}: SettingsPageProps) {
	return (
		<div className="flex flex-col gap-2">
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
					<CardTitle>Asset Index</CardTitle>
					<CardDescription>Warframe asset data</CardDescription>
				</CardHeader>
				<CardContent>
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
						<div>
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
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Inventory Data</CardTitle>
						<CardDescription>Raw inventory JSON</CardDescription>
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
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>
		</div>
	);
}
