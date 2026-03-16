import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RelicScanEntry } from "@/types";

interface RelicScannerPageProps {
	scannerStatus: "stopped" | "watching" | "error";
	scannerEnabled: boolean;
	scans: RelicScanEntry[];
}

function statusBadgeVariant(status: RelicScanEntry["status"]) {
	switch (status) {
		case "resolved":
			return "default" as const;
		case "error":
			return "destructive" as const;
		default:
			return "secondary" as const;
	}
}

function sourceLabel(source: RelicScanEntry["source"]): string {
	switch (source) {
		case "auto-early":
			return "Auto (Early)";
		case "auto-late":
			return "Auto (Late)";
		case "hotkey":
			return "Hotkey";
		case "image-test":
			return "Image Test";
		default:
			return "Manual";
	}
}

export function RelicScannerPage({
	scannerStatus,
	scannerEnabled,
	scans,
}: RelicScannerPageProps) {
	const latestScan = scans[0];
	const recentScans = useMemo(() => scans.slice(0, 20), [scans]);

	return (
		<div className="flex flex-col h-full min-h-0 gap-2">
			<Card>
				<CardHeader>
					<CardTitle>Relic Scanner</CardTitle>
					<CardDescription>
						Detects reward-screen triggers and resolves platinum and ducat values in
						YumeFrame.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center gap-2">
					<Badge variant={scannerStatus === "watching" ? "default" : "secondary"}>
						{scannerStatus === "watching" ? "Watching EE.log" : "Scanner stopped"}
					</Badge>
					<Badge variant={scannerEnabled ? "outline" : "secondary"}>
						{scannerEnabled ? "Enabled" : "Disabled"}
					</Badge>
				</CardContent>
			</Card>

			<Card className="gap-2 py-4">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Latest Scan</CardTitle>
				</CardHeader>
				<CardContent>
					{!latestScan ? (
						<p className="text-sm text-muted-foreground">
							No scan events yet. Run a manual scan or open the relic reward screen.
						</p>
					) : (
						<div className="space-y-3">
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<Badge variant={statusBadgeVariant(latestScan.status)}>
									{latestScan.status}
								</Badge>
								<span>{sourceLabel(latestScan.source)}</span>
								<span>
									{new Date(latestScan.triggeredAt).toLocaleTimeString()}
								</span>
							</div>
							{latestScan.rewards.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No rewards resolved for this scan yet.
								</p>
							) : (
								<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
									{latestScan.rewards.map((reward) => (
										<div
											key={`${latestScan.id}-${reward.rewardName}`}
											className="p-2 border rounded bg-muted/20"
										>
											<p className="text-sm font-medium">{reward.displayName}</p>
											<p className="text-xs text-muted-foreground">
												{reward.platinum.toFixed(2)}p | {reward.ducats} ducats
											</p>
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			<Card className="flex-1 min-h-0 py-4">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Recent Scan Events</CardTitle>
				</CardHeader>
				<CardContent className="min-h-0">
					<ScrollArea className="border rounded h-70">
						<div className="p-2 space-y-1">
							{recentScans.map((scan) => (
								<div
									key={scan.id}
									className="flex items-center justify-between px-2 py-1 border rounded bg-background"
								>
									<div className="min-w-0">
										<p className="text-xs truncate">
											{sourceLabel(scan.source)}
										</p>
										<p className="truncate text-[11px] text-muted-foreground">
											{scan.rewards.length} reward(s)
										</p>
									</div>
									<Badge variant={statusBadgeVariant(scan.status)}>
										{scan.status}
									</Badge>
								</div>
							))}
							{recentScans.length === 0 ? (
								<p className="px-2 py-1 text-xs text-muted-foreground">
									No events yet.
								</p>
							) : null}
						</div>
					</ScrollArea>
				</CardContent>
			</Card>
		</div>
	);
}
