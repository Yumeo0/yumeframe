import { invoke } from "@tauri-apps/api/core";
import { resolveNode } from "@yumeo0/warframe-worldstate";
import { Clock3, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	type ArbitrationTier,
	getArbitrationTierByName,
} from "@/data/arbitrationTierList";
import { formatDateTime } from "@/lib/datetime.utils";

interface ArbitrationsPageProps {
	eeLogPath: string;
	use24HourClock: boolean;
}

interface ArbitrationScheduleEntry {
	timestampSec: number;
	nodeCode: string;
}

interface AssetEntry {
	filename: string;
	hash: string;
}

interface ExportRegionNode {
	uniqueName: string;
	missionIndex: number;
}

interface ExportRegionsPayload {
	ExportRegions?: ExportRegionNode[];
}

interface ArbitrationLiveStats {
	sessionFound: boolean;
	missionCode: string | null;
	startedAtLogSeconds: number | null;
	endedAtLogSeconds: number | null;
	durationSeconds: number;
	roundsCompleted: number;
	rewardsDetected: number;
	droneSpawns: number;
	droneKills: number;
	enemiesKilled: number;
	revives: number;
	vitusEssencePickups: number;
	extractionDetected: boolean;
	linesScanned: number;
	note: string | null;
}

const AVAILABLE_TIERS: ArbitrationTier[] = ["S", "A", "B", "C", "D", "F"];

const LIVE_DATA_COMMAND = "fetch_latest_arbitration_stats";
const WARFRAME_INDEX_COMMAND = "fetch_warframe_index";
const REGIONS_DATA_COMMAND = "fetch_regions_data";
const ARBITRATION_ROTATION_SECONDS = 60 * 60;

const MISSION_INDEX_LABELS: Record<number, string> = {
	0: "Assassination",
	1: "Exterminate",
	2: "Survival",
	3: "Rescue",
	4: "Sabotage",
	5: "Capture",
	6: "Unknown",
	7: "Spy",
	8: "Defense",
	9: "Mobile Defense",
	10: "Unknown",
	11: "Unknown",
	12: "Unknown",
	13: "Interception",
	14: "Hijack",
	15: "Hive Sabotage",
	16: "Unknown",
	17: "Excavation",
	18: "Unknown",
	19: "Unknown",
	20: "Unknown",
	21: "Infested Salvage",
	22: "Rathuum",
	23: "Unknown",
	24: "Pursuit",
	25: "Rush",
	26: "Assault",
	27: "Defection",
	28: "Landscape",
	29: "Unknown",
	30: "Unknown",
	31: "The Circuit",
	32: "Unknown",
	33: "Disruption",
	34: "Void Flood",
	35: "Void Cascade",
	36: "Void Armageddon",
	37: "Unknown",
	38: "Alchemy",
	39: "Unknown",
	40: "Legacyte Harvest",
	41: "Shrine Defense",
	42: "Faceoff",
};

function normalizeNodeCode(raw: string): string {
	return raw.replace(/\s+/g, "").trim();
}

function formatNodeLabel(nodeCode: string): string {
	const compact = normalizeNodeCode(nodeCode);
	if (!compact) {
		return "Unknown Node";
	}

	const resolved = resolveNode(compact);
	if (resolved && resolved.toLowerCase() !== compact.toLowerCase()) {
		return resolved;
	}

	const fallbackMatch = compact.match(
		/^(SolNode|ClanNode|SettlementNode)(\d+)$/i,
	);
	if (fallbackMatch) {
		const [, prefix, id] = fallbackMatch;
		if (/^solnode$/i.test(prefix)) {
			return `Node ${id}`;
		}
		if (/^clannode$/i.test(prefix)) {
			return `Dojo Node ${id}`;
		}
		return `Settlement Node ${id}`;
	}

	return compact;
}

function formatDuration(seconds: number): string {
	if (seconds <= 0) {
		return "0m 0s";
	}

	const total = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const remainingSeconds = total % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m ${remainingSeconds}s`;
	}

	return `${minutes}m ${remainingSeconds}s`;
}

function extractNodeCode(uniqueName: string): string {
	const compact = normalizeNodeCode(uniqueName);
	const slashIndex = compact.lastIndexOf("/");
	if (slashIndex >= 0 && slashIndex + 1 < compact.length) {
		return compact.slice(slashIndex + 1);
	}
	return compact;
}

function resolveMissionModeLabel(missionIndex: number): string {
	if (!Number.isInteger(missionIndex)) {
		return "Unknown";
	}

	return MISSION_INDEX_LABELS[missionIndex] ?? `Mission ${missionIndex}`;
}

function resolveEntryTier(nodeCode: string): ArbitrationTier | null {
	const label = formatNodeLabel(nodeCode);
	if (!label) {
		return null;
	}

	const nodeName = label.split(",", 2)[0]?.trim() ?? "";
	if (!nodeName) {
		return null;
	}

	return getArbitrationTierByName(nodeName);
}

function formatCountdown(timestampSec: number, nowMs: number): string {
	const targetMs = timestampSec * 1000;
	const deltaMs = targetMs - nowMs;
	if (deltaMs <= 0) {
		return "Started";
	}

	const totalSeconds = Math.floor(deltaMs / 1000);
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);

	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	}

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	return `${minutes}m`;
}

function getDayStartMs(timestampSec: number): number {
	const date = new Date(timestampSec * 1000);
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

function formatDayLabel(dayStartMs: number): string {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(new Date(dayStartMs));
}

function getTierBadgeClassName(tier: ArbitrationTier | null): string {
	switch (tier) {
		case "S":
			return "border-emerald-300 bg-emerald-500/20 text-emerald-400";
		case "A":
			return "border-cyan-300 bg-cyan-500/20 text-cyan-400";
		case "B":
			return "border-blue-300 bg-blue-500/20 text-blue-400";
		case "C":
			return "border-amber-300 bg-amber-500/20 text-amber-400";
		case "D":
			return "border-orange-300 bg-orange-500/20 text-orange-400";
		case "F":
			return "border-rose-300 bg-rose-500/20 text-rose-400";
		default:
			return "border-border bg-muted/50 text-muted-foreground";
	}
}

export function ArbitrationsPage({
	eeLogPath,
	use24HourClock,
}: ArbitrationsPageProps) {
	const scheduleScrollAreaRef = useRef<HTMLDivElement | null>(null);
	const dragPointerIdRef = useRef<number | null>(null);
	const dragStartXRef = useRef(0);
	const dragStartYRef = useRef(0);
	const dragStartScrollLeftRef = useRef(0);
	const dragStartScrollTopRef = useRef(0);
	const [schedule, setSchedule] = useState<ArbitrationScheduleEntry[]>([]);
	const [modeByNodeCode, setModeByNodeCode] = useState<Record<string, string>>(
		{},
	);
	const [scheduleLoading, setScheduleLoading] = useState(true);
	const [scheduleError, setScheduleError] = useState<string | null>(null);
	const [analyzer, setAnalyzer] = useState<ArbitrationLiveStats | null>(null);
	const [liveLoading, setLiveLoading] = useState(false);
	const [liveError, setLiveError] = useState<string | null>(null);
	const [nowMs, setNowMs] = useState(Date.now());
	const [selectedDays, setSelectedDays] = useState(7);
	const [selectedTiers, setSelectedTiers] = useState<ArbitrationTier[]>([]);
	const [isScheduleDragging, setIsScheduleDragging] = useState(false);

	const toggleTier = useCallback((tier: ArbitrationTier) => {
		setSelectedTiers((current) =>
			current.includes(tier)
				? current.filter((currentTier) => currentTier !== tier)
				: [...current, tier],
		);
	}, []);

	const getScheduleViewport = useCallback((): HTMLDivElement | null => {
		if (!scheduleScrollAreaRef.current) {
			return null;
		}

		const viewport = scheduleScrollAreaRef.current.querySelector(
			'[data-slot="scroll-area-viewport"]',
		);

		return viewport instanceof HTMLDivElement ? viewport : null;
	}, []);

	const onSchedulePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			const viewport = getScheduleViewport();
			if (!viewport) {
				return;
			}

			const hasHorizontalOverflow = viewport.scrollWidth > viewport.clientWidth;
			const hasVerticalOverflow = viewport.scrollHeight > viewport.clientHeight;

			if (!hasHorizontalOverflow && !hasVerticalOverflow) {
				return;
			}

			dragPointerIdRef.current = event.pointerId;
			dragStartXRef.current = event.clientX;
			dragStartYRef.current = event.clientY;
			dragStartScrollLeftRef.current = viewport.scrollLeft;
			dragStartScrollTopRef.current = viewport.scrollTop;
			setIsScheduleDragging(true);
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[getScheduleViewport],
	);

	const onSchedulePointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (dragPointerIdRef.current !== event.pointerId) {
				return;
			}

			const viewport = getScheduleViewport();
			if (!viewport) {
				return;
			}

			const deltaX = event.clientX - dragStartXRef.current;
			const deltaY = event.clientY - dragStartYRef.current;
			if (viewport.scrollWidth > viewport.clientWidth) {
				viewport.scrollLeft = dragStartScrollLeftRef.current - deltaX;
			}

			if (viewport.scrollHeight > viewport.clientHeight) {
				viewport.scrollTop = dragStartScrollTopRef.current - deltaY;
			}
		},
		[getScheduleViewport],
	);

	const onSchedulePointerUp = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (dragPointerIdRef.current !== event.pointerId) {
				return;
			}

			dragPointerIdRef.current = null;
			setIsScheduleDragging(false);
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
		},
		[],
	);

	const onScheduleWheel = useCallback(
		(event: React.WheelEvent<HTMLDivElement>) => {
			const viewport = getScheduleViewport();
			if (!viewport || viewport.scrollWidth <= viewport.clientWidth) {
				return;
			}

			if (event.shiftKey && event.deltaX === 0 && event.deltaY !== 0) {
				event.preventDefault();
				viewport.scrollLeft += event.deltaY;
			}
		},
		[getScheduleViewport],
	);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setNowMs(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		let cancelled = false;

		const loadSchedule = async () => {
			setScheduleLoading(true);
			setScheduleError(null);

			try {
				const [response, assets] = await Promise.all([
					fetch("/arbys.txt"),
					invoke<AssetEntry[]>(WARFRAME_INDEX_COMMAND),
				]);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const text = await response.text();
				const entries = text
					.split(/\r?\n/)
					.map((line) => line.trim())
					.filter((line) => line.length > 0)
					.map((line) => {
						const [timestampRaw, nodeRaw] = line.split(",", 2);
						const timestampSec = Number.parseInt(
							(timestampRaw ?? "").trim(),
							10,
						);
						return {
							timestampSec,
							nodeCode: normalizeNodeCode(nodeRaw ?? ""),
						};
					})
					.filter(
						(entry) =>
							Number.isFinite(entry.timestampSec) &&
							entry.timestampSec > 0 &&
							entry.nodeCode.length > 0,
					)
					.sort((a, b) => a.timestampSec - b.timestampSec);

				const regionsRaw = await invoke<string>(REGIONS_DATA_COMMAND, {
					assets,
				});
				const parsedRegions = JSON.parse(regionsRaw) as ExportRegionsPayload;
				const nodes = Array.isArray(parsedRegions.ExportRegions)
					? parsedRegions.ExportRegions
					: [];

				const nextModeByNodeCode: Record<string, string> = {};
				for (const node of nodes) {
					const nodeCode = extractNodeCode(node.uniqueName ?? "");
					if (!nodeCode) {
						continue;
					}

					nextModeByNodeCode[nodeCode] = resolveMissionModeLabel(
						node.missionIndex,
					);
				}

				if (!cancelled) {
					setSchedule(entries);
					setModeByNodeCode(nextModeByNodeCode);
				}
			} catch (error) {
				if (!cancelled) {
					const message =
						error instanceof Error
							? error.message
							: "Unknown error while loading schedule";
					setScheduleError(message);
					setModeByNodeCode({});
				}
			} finally {
				if (!cancelled) {
					setScheduleLoading(false);
				}
			}
		};

		void loadSchedule();

		return () => {
			cancelled = true;
		};
	}, []);

	const refreshAnalyzer = useCallback(async () => {
		setLiveLoading(true);
		setLiveError(null);

		try {
			const result = await invoke<ArbitrationLiveStats>(LIVE_DATA_COMMAND, {
				eeLogPath,
			});
			setAnalyzer(result);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unknown error while loading live data";
			setLiveError(message);
		} finally {
			setLiveLoading(false);
		}
	}, [eeLogPath]);

	useEffect(() => {
		void refreshAnalyzer();
	}, [refreshAnalyzer]);

	const scheduleByDay = useMemo(() => {
		if (schedule.length === 0) {
			return [];
		}

		const nowSec = Math.floor(nowMs / 1000);
		const todayStartMs = (() => {
			const now = new Date(nowMs);
			now.setHours(0, 0, 0, 0);
			return now.getTime();
		})();

		const dayBuckets = new Map<number, ArbitrationScheduleEntry[]>();
		const isTierFilteringEnabled = selectedTiers.length > 0;

		for (const entry of schedule) {
			if (isTierFilteringEnabled) {
				const entryTier = resolveEntryTier(entry.nodeCode);
				if (!entryTier || !selectedTiers.includes(entryTier)) {
					continue;
				}
			}

			const entryEndSec = entry.timestampSec + ARBITRATION_ROTATION_SECONDS;
			if (entryEndSec <= nowSec) {
				continue;
			}

			const dayStartMs = getDayStartMs(entry.timestampSec);

			const bucket = dayBuckets.get(dayStartMs);
			if (bucket) {
				bucket.push(entry);
			} else {
				dayBuckets.set(dayStartMs, [entry]);
			}
		}

		return Array.from(dayBuckets.entries())
			.sort((a, b) => a[0] - b[0])
			.slice(0, selectedDays)
			.map(([dayStartMs, entries]) => ({
				dayStartMs,
				dayLabel: formatDayLabel(dayStartMs),
				isToday: dayStartMs === todayStartMs,
				entries,
			}));
	}, [schedule, nowMs, selectedDays, selectedTiers]);

	return (
		<div className="flex flex-col h-full min-h-0 gap-2">
			<Tabs defaultValue="schedule" className="flex-1 min-h-0">
				<TabsList>
					<TabsTrigger value="schedule">Schedule</TabsTrigger>
					<TabsTrigger value="analyzer">Analyzer</TabsTrigger>
				</TabsList>

				<TabsContent value="schedule" className="min-h-0">
					<Card className="flex flex-col h-full min-h-0 gap-2 py-4">
						<CardHeader className="pb-0">
							<div className="flex items-center justify-between gap-2">
								<CardTitle className="text-base">
									Upcoming Arbitrations
								</CardTitle>
								<div className="flex items-center gap-2">
									<div className="flex items-center gap-1">
										<Button
											type="button"
											size="sm"
											variant={selectedTiers.length === 0 ? "default" : "outline"}
											onClick={() => setSelectedTiers([])}
										>
											All
										</Button>
										{AVAILABLE_TIERS.map((tier) => {
											const selected = selectedTiers.includes(tier);

											return (
												<Button
													key={tier}
													type="button"
													size="sm"
													variant={selected ? "default" : "outline"}
													onClick={() => toggleTier(tier)}
												>
													{tier}
												</Button>
											);
										})}
									</div>
									<Select
										value={selectedDays.toString()}
										onValueChange={(value) =>
											setSelectedDays(Number.parseInt(value, 10))
										}
									>
										<SelectTrigger className="w-fit">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="7">7 Days</SelectItem>
											<SelectItem value="15">15 Days</SelectItem>
											<SelectItem value="30">30 Days</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex flex-col flex-1 min-h-0">
							{scheduleLoading ? (
								<p className="text-sm text-muted-foreground">
									Loading schedule...
								</p>
							) : scheduleError ? (
								<p className="text-sm text-destructive">{scheduleError}</p>
							) : scheduleByDay.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									{selectedTiers.length === 0
										? "No arbitration schedule entries were found."
										: `No entries found for tiers: ${selectedTiers.join(", ")}.`}
								</p>
							) : (
								<ScrollArea
									ref={scheduleScrollAreaRef}
									className="flex-1 w-full min-h-0"
									onPointerDown={onSchedulePointerDown}
									onPointerMove={onSchedulePointerMove}
									onPointerUp={onSchedulePointerUp}
									onPointerCancel={onSchedulePointerUp}
									onWheel={onScheduleWheel}
								>
									<div
										className={`flex min-w-max items-start gap-3 pb-2 ${
											isScheduleDragging ? "cursor-grabbing" : "cursor-grab"
										}`}
									>
										{scheduleByDay.map((day) => (
											<div
												key={day.dayStartMs}
												className="flex w-[320px] min-w-[320px] flex-col rounded-md border p-2"
											>
												<div className="flex items-center justify-between pb-2 mb-2 border-b">
													<div>
														<p className="text-sm font-semibold">
															{day.dayLabel}
														</p>
													</div>
													{day.isToday ? (
														<Badge variant="outline">Today</Badge>
													) : null}
												</div>

												<div className="pr-1 space-y-1">
													{day.entries.map((entry) => {
														const missionMode =
															modeByNodeCode[entry.nodeCode] ?? "Unknown";
														const tier = resolveEntryTier(entry.nodeCode);
														return (
															<div
																key={`${entry.timestampSec}-${entry.nodeCode}`}
																className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
															>
																<div className="min-w-0">
																	<p className="text-sm font-medium truncate">
																		{formatNodeLabel(entry.nodeCode)}
																	</p>
																	<p className="text-xs truncate text-muted-foreground">
																		{formatDateTime(
																			entry.timestampSec * 1000,
																			use24HourClock,
																		)}
																	</p>
																	<p className="text-xs truncate text-muted-foreground">
																		{missionMode}
																	</p>
																</div>
																<div className="flex flex-col items-end gap-1">
																	<Badge
                                                                        className="text-gray-300 border-gray-500 bg-gray-500/20"
																	>
																		{formatCountdown(entry.timestampSec, nowMs)}
																	</Badge>
																	<Badge
																		variant="outline"
																		className={getTierBadgeClassName(tier)}
																	>
																		Tier {tier ?? "-"}
																	</Badge>
																</div>
															</div>
														);
													})}
												</div>
											</div>
										))}
									</div>
									<ScrollBar orientation="horizontal" />
								</ScrollArea>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="analyzer" className="min-h-0">
					<div className="grid grid-cols-1 gap-2 lg:grid-cols-[2fr_1fr]">
						<Card>
							<CardHeader className="pb-2">
								<div className="flex items-center justify-between gap-2">
									<div>
										<CardTitle className="text-base">
											Latest Arbitration Run
										</CardTitle>
										<CardDescription>
											Parsed from the most recent completed session in EE.log
										</CardDescription>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => void refreshAnalyzer()}
										disabled={liveLoading}
									>
										{liveLoading ? (
											<RefreshCw className="w-4 h-4 animate-spin" />
										) : (
											<RefreshCw className="w-4 h-4" />
										)}
										Refresh
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{liveError ? (
									<p className="text-sm text-destructive">{liveError}</p>
								) : !analyzer ? (
									<p className="text-sm text-muted-foreground">
										Loading live data...
									</p>
								) : !analyzer.sessionFound ? (
									<p className="text-sm text-muted-foreground">
										No completed arbitration session found yet in the current
										log window.
									</p>
								) : (
									<div className="space-y-3">
										<div className="grid grid-cols-2 gap-2 md:grid-cols-3">
											<div className="p-2 border rounded">
												<p className="text-xs text-muted-foreground">Node</p>
												<p className="text-sm font-medium">
													{formatNodeLabel(analyzer.missionCode ?? "")}
												</p>
											</div>
											<div className="p-2 border rounded">
												<p className="text-xs text-muted-foreground">
													Duration
												</p>
												<p className="text-sm font-medium">
													{formatDuration(analyzer.durationSeconds)}
												</p>
											</div>
											<div className="p-2 border rounded">
												<p className="text-xs text-muted-foreground">Rounds</p>
												<p className="text-sm font-medium">
													{analyzer.roundsCompleted}
												</p>
											</div>
											<div className="p-2 border rounded">
												<p className="text-xs text-muted-foreground">Rewards</p>
												<p className="text-sm font-medium">
													{analyzer.rewardsDetected}
												</p>
											</div>
											<div className="p-2 border rounded">
												<p className="text-xs text-muted-foreground">
													Drone Kills
												</p>
												<p className="text-sm font-medium">
													{analyzer.droneKills}
												</p>
											</div>
											<div className="p-2 border rounded">
												<p className="text-xs text-muted-foreground">
													Vitus Pickups
												</p>
												<p className="text-sm font-medium">
													{analyzer.vitusEssencePickups}
												</p>
											</div>
										</div>

										{analyzer.note ? (
											<p className="text-xs text-muted-foreground">
												{analyzer.note}
											</p>
										) : null}
									</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">Parser Info</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2 text-sm">
								<div className="flex items-center gap-2 text-muted-foreground">
									<Clock3 className="w-4 h-4" />
									<span>EE.log window parser</span>
								</div>
								<p className="text-xs break-all text-muted-foreground">
									{eeLogPath || "Using detected default EE.log path"}
								</p>
								{analyzer ? (
									<>
										<p className="text-xs text-muted-foreground">
											Lines scanned: {analyzer.linesScanned}
										</p>
										<p className="text-xs text-muted-foreground">
											Extraction detected:{" "}
											{analyzer.extractionDetected ? "Yes" : "No"}
										</p>
									</>
								) : null}
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
