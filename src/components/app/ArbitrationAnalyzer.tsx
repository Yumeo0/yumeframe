import { invoke } from "@tauri-apps/api/core";
import { Image as TauriImage } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import html2canvas from "html2canvas-pro";
import { Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	LabelList,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectSeparator } from "../ui/select";

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
	enemySpawns: number;
	avgDroneIntervalSeconds: number | null;
	rewardTimestamps: number[];
	droneTimestamps: number[];
	liveCounts: Array<{ t: number; val: number }>;
	enemiesKilled: number;
	revives: number;
	vitusEssencePickups: number;
	extractionDetected: boolean;
	linesScanned: number;
	note: string | null;
}

interface ArbitrationAnalyzerProps {
	eeLogPath: string;
	formatNodeLabel: (nodeCode: string) => string;
}

const LIVE_DATA_COMMAND = "fetch_latest_arbitration_stats";
const DROP_CHANCE = 0.15;
const RETRIEVER_CHANCE = 0.18;
const MIRROR_DEFENSE_MAPS = ["Munio", "Tyana"];
const SCENARIOS = [
	{ z: -2.326, prob: "99%", desc: "Worst Case" },
	{ z: -1.282, prob: "90%", desc: "Unlucky" },
	{ z: -0.674, prob: "75%", desc: "Below Avg" },
	{ z: 0.0, prob: "50%", desc: "Average" },
	{ z: 0.674, prob: "25%", desc: "Above Avg" },
	{ z: 1.282, prob: "10%", desc: "High Roll" },
	{ z: 2.326, prob: "1%", desc: "God Roll" },
] as const;

const SATURATION_BUCKET_STEP = 3;
const SATURATION_BUCKET_MAX = 30;

type SaturationChartPoint = {
	label: string;
	percent: number;
	fill: string;
};

type DpmChartPoint = {
	rotation: number;
	dpm: number;
};

type DroneRotationPoint = {
	rotation: number;
	count: number;
	fill: string;
};

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

function getGradientColor(percent: number): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const hue = Math.max(0, 120 - (clamped / 18) * 120);
	return `hsl(${hue}, 100%, 50%)`;
}

function standardNormalCdf(z: number): number {
	const absZ = Math.abs(z);
	const t = 1 / (1 + 0.2316419 * absZ);
	const d = 0.3989423 * Math.exp((-absZ * absZ) / 2);
	const polynomial =
		t *
		(0.3193815 +
			t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
	const cdf = 1 - d * polynomial;
	return z >= 0 ? cdf : 1 - cdf;
}

function getLuckLabel(zScore: number): string {
	if (zScore >= 2.326) {
		return "God Roll";
	}
	if (zScore >= 1.282) {
		return "High Roll";
	}
	if (zScore >= 0.674) {
		return "Above Avg";
	}
	if (zScore >= -0.674) {
		return "Average";
	}
	if (zScore >= -1.282) {
		return "Below Avg";
	}
	if (zScore >= -2.326) {
		return "Unlucky";
	}
	return "Worst Case";
}

function getLuckColor(zScore: number): string {
	if (zScore >= 2.326) {
		return "#FFD700";
	}
	if (zScore >= 1.282) {
		return "#00E676";
	}
	if (zScore >= 0.674) {
		return "#B2FF59";
	}
	if (zScore >= -0.674) {
		return "#FAFAFA";
	}
	if (zScore >= -1.282) {
		return "#FFCC80";
	}
	if (zScore >= -2.326) {
		return "#FF9100";
	}
	return "#FF5252";
}

export function ArbitrationAnalyzer({
	eeLogPath,
	formatNodeLabel,
}: ArbitrationAnalyzerProps) {
	const analyzerContentRef = useRef<HTMLDivElement | null>(null);
	const [analyzer, setAnalyzer] = useState<ArbitrationLiveStats | null>(null);
	const [liveLoading, setLiveLoading] = useState(false);
	const [liveError, setLiveError] = useState<string | null>(null);
	const [actualVitusInput, setActualVitusInput] = useState<string>("");
	const [actualDroneInput, setActualDroneInput] = useState<string>("");
	const [copyLoading, setCopyLoading] = useState(false);
	const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

	const copyAnalyzerAsImage = useCallback(async () => {
		if (!analyzerContentRef.current || copyLoading) {
			return;
		}

		setCopyLoading(true);
		setCopyMessage(null);
		let cloned: HTMLDivElement | null = null;

		try {
			const source = analyzerContentRef.current;
			const sourceRect = source.getBoundingClientRect();
			const sourceCard = source.closest<HTMLElement>('[data-slot="card"]');
			const sourceCardBackground = sourceCard
				? getComputedStyle(sourceCard).backgroundColor
				: "rgba(0, 0, 0, 0)";
			const canvasBackground =
				sourceCardBackground !== "rgba(0, 0, 0, 0)"
					? sourceCardBackground
					: "#09090b";
			cloned = source.cloneNode(true) as HTMLDivElement;

			cloned.style.position = "fixed";
			cloned.style.left = "-100000px";
			cloned.style.top = "0";
			cloned.style.width = `${Math.ceil(sourceRect.width)}px`;
			cloned.style.height = "auto";
			cloned.style.maxHeight = "none";
			cloned.style.minHeight = "0";
			cloned.style.overflow = "visible";
			cloned.style.pointerEvents = "none";
			cloned.style.zIndex = "-1";
			cloned.style.background = canvasBackground;

			for (const slot of ["card", "card-header", "card-content"] as const) {
				const sourceElements = source.querySelectorAll<HTMLElement>(
					`[data-slot="${slot}"]`,
				);
				const clonedElements = cloned.querySelectorAll<HTMLElement>(
					`[data-slot="${slot}"]`,
				);

				for (let index = 0; index < clonedElements.length; index++) {
					const sourceElement = sourceElements[index];
					const clonedElement = clonedElements[index];
					if (!sourceElement || !clonedElement) {
						continue;
					}

					const computed = getComputedStyle(sourceElement);
					clonedElement.style.backgroundColor = computed.backgroundColor;
					clonedElement.style.color = computed.color;
					clonedElement.style.borderColor = computed.borderColor;
					clonedElement.style.boxShadow = computed.boxShadow;
				}
			}

			for (const element of cloned.querySelectorAll<HTMLElement>(
				'[data-slot="scroll-area"], [data-slot="scroll-area-viewport"]',
			)) {
				element.style.height = "auto";
				element.style.maxHeight = "none";
				element.style.minHeight = "0";
				element.style.overflow = "visible";
			}

			for (const scrollbarElement of cloned.querySelectorAll<HTMLElement>(
				'[data-slot="scroll-area-scrollbar"], [data-slot="scroll-area-corner"]',
			)) {
				scrollbarElement.style.display = "none";
			}

			for (const input of cloned.querySelectorAll<
				HTMLInputElement | HTMLTextAreaElement
			>("input, textarea")) {
				if (
					input instanceof HTMLInputElement &&
					["hidden", "checkbox", "radio", "button", "submit"].includes(
						input.type,
					)
				) {
					continue;
				}

				const value = input.value.trim();
				const previousSibling = input.previousElementSibling as HTMLElement | null;
				const nextSibling = input.nextElementSibling as HTMLElement | null;

				if (!value) {
					if (previousSibling?.getAttribute("data-slot") === "select-separator") {
						previousSibling.remove();
					}
					if (nextSibling?.getAttribute("data-slot") === "select-separator") {
						nextSibling.remove();
					}
					input.remove();
					continue;
				}

				const placeholderLabel = input.placeholder?.trim();
				const sourceLabel = placeholderLabel
					? placeholderLabel.replace(/^enter\s+/i, "")
					: (
							input
								.closest(".p-2.border.rounded")
								?.querySelector("p")
								?.textContent?.trim() ?? "Value"
						);
				const label = sourceLabel.replace(/\b\w/g, (char) =>
					char.toUpperCase(),
				);

				const replacement = document.createElement("div");
				replacement.textContent = `${label}: ${value}`;
				replacement.style.display = "block";
				replacement.style.width = "100%";
				replacement.style.minHeight = "2rem";
				replacement.style.padding = "0.35rem 0.5rem";
				replacement.style.border = "1px solid rgba(161, 161, 170, 0.4)";
				replacement.style.background = "rgba(24, 24, 27, 0.75)";
				replacement.style.color = "#fafafa";
				replacement.style.fontSize = "0.875rem";
				replacement.style.fontWeight = "600";
				replacement.style.lineHeight = "1.25rem";

				input.replaceWith(replacement);
			}

			const cloneHost = source.parentElement ?? document.body;
			cloneHost.appendChild(cloned);

			const canvas = await html2canvas(cloned, {
				backgroundColor: canvasBackground,
				logging: false,
				scale: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
				useCORS: true,
				windowWidth: Math.ceil(cloned.scrollWidth),
				windowHeight: Math.ceil(cloned.scrollHeight),
			});

			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) {
				throw new Error("Could not access canvas context.");
			}

			const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
			const rgba = Array.from(imageData.data);
			const tauriImage = await TauriImage.new(
				rgba,
				canvas.width,
				canvas.height,
			);
			await writeImage(tauriImage);
			setCopyMessage("Analyzer image copied.");
		} catch (error) {
			const reason =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: JSON.stringify(error);
			setCopyMessage(
				`Copy failed: ${reason}`,
			);
		} finally {
			if (cloned?.isConnected) {
				cloned.remove();
			}
			setCopyLoading(false);
		}
	}, [copyLoading]);

	const derived = useMemo(() => {
		if (!analyzer?.sessionFound) {
			return null;
		}

		const actualDroneKills = Number.parseFloat(actualDroneInput);
		const effectiveDroneKills =
			Number.isFinite(actualDroneKills) && actualDroneKills >= 0
				? actualDroneKills
				: analyzer.droneKills;

		const isMirrorNode = MIRROR_DEFENSE_MAPS.some((name) =>
			(analyzer.missionCode ?? "").toLowerCase().includes(name.toLowerCase()),
		);
		const isDefense =
			(analyzer.missionCode ?? "").toLowerCase().includes("defense") ||
			isMirrorNode;
		const wavesPerRotation = isMirrorNode ? 2 : 3;
		const totalEnemies = analyzer.enemySpawns + effectiveDroneKills;
		const killsPerDrone =
			effectiveDroneKills > 0 ? totalEnemies / effectiveDroneKills : null;

		const rounds = analyzer.roundsCompleted;
		const meanVal = 4 * RETRIEVER_CHANCE + 2 * (1 - RETRIEVER_CHANCE);
		const expectValSq = 16 * RETRIEVER_CHANCE + 4 * (1 - RETRIEVER_CHANCE);
		const varVal = expectValSq - meanVal ** 2;
		const rotTotalMean = rounds + rounds * 0.1 * wavesPerRotation;
		const rotVar = rounds * 0.1 * (1 - 0.1) * wavesPerRotation ** 2;
		const meanDrops = effectiveDroneKills * DROP_CHANCE;
		const varDrops = effectiveDroneKills * DROP_CHANCE * (1 - DROP_CHANCE);
		const totalDroneMean = meanDrops * meanVal;
		const totalDroneVar = meanDrops * varVal + meanVal ** 2 * varDrops;
		const grandMean = rotTotalMean + totalDroneMean;
		const grandStd = Math.sqrt(rotVar + totalDroneVar);

		const scenarios = SCENARIOS.map((scenario) => ({
			...scenario,
			score: Math.round(grandMean + scenario.z * grandStd),
		}));

		const actualVitus = Number.parseFloat(actualVitusInput);
		const vitusPerMinute =
			Number.isFinite(actualVitus) &&
			actualVitus >= 0 &&
			analyzer.durationSeconds > 0
				? actualVitus / (analyzer.durationSeconds / 60)
				: null;
		const actualVitusLuck =
			Number.isFinite(actualVitus) && actualVitus >= 0 && grandStd > 0
				? (() => {
						const zScore = (actualVitus - grandMean) / grandStd;
						const percentile = standardNormalCdf(zScore) * 100;
						const isBelowAverage = zScore < 0;
						const tailPercent = isBelowAverage
							? percentile
							: Math.max(0, 100 - percentile);
						return {
							text: `${getLuckLabel(zScore)} (${isBelowAverage ? "Bottom" : "Top"} ${tailPercent.toFixed(1)}%)`,
							color: getLuckColor(zScore),
						};
					})()
				: null;

		const liveCounts = analyzer.liveCounts ?? [];
		const saturationBuckets = new Array(
			Math.ceil(SATURATION_BUCKET_MAX / SATURATION_BUCKET_STEP),
		).fill(0) as number[];
		let saturationTotalSeconds = 0;

		for (let index = 0; index < liveCounts.length - 1; index++) {
			const currentPoint = liveCounts[index];
			const nextPoint = liveCounts[index + 1];
			const delta = nextPoint.t - currentPoint.t;
			if (delta <= 0 || delta > 29) {
				continue;
			}

			let bucketIndex = Math.floor(currentPoint.val / SATURATION_BUCKET_STEP);
			if (bucketIndex >= saturationBuckets.length - 1) {
				bucketIndex = saturationBuckets.length - 1;
			}

			saturationBuckets[bucketIndex] += delta;
			saturationTotalSeconds += delta;
		}

		const saturationData: SaturationChartPoint[] = saturationBuckets.map(
			(duration, index) => {
				const start = index * SATURATION_BUCKET_STEP;
				const end = start + SATURATION_BUCKET_STEP - 1;
				const isLast = index === saturationBuckets.length - 1;
				const label = isLast ? `${start}+` : `${start}-${end}`;
				const percent =
					saturationTotalSeconds > 0
						? Number(((duration / saturationTotalSeconds) * 100).toFixed(1))
						: 0;
				const hueStart = 100;
				const hueStep = isDefense ? 15 : 25;
				const hue = Math.max(0, hueStart - index * hueStep);
				const lightness =
					hue === 0 && index > saturationBuckets.length / 2 ? 45 : 50;

				return {
					label,
					percent,
					fill: `hsl(${hue}, 100%, ${lightness}%)`,
				};
			},
		);

		const thresholdPercent = (() => {
			if (saturationTotalSeconds <= 0) {
				return 0;
			}

			let above = 0;
			for (let index = 0; index < saturationBuckets.length; index++) {
				const start = index * SATURATION_BUCKET_STEP;
				if (start >= 15) {
					above += saturationBuckets[index];
				}
			}

			return Number(((above / saturationTotalSeconds) * 100).toFixed(1));
		})();

		const rewardTimestamps = analyzer.rewardTimestamps ?? [];
		const droneTimestamps = analyzer.droneTimestamps ?? [];
		const dronesPerRotation: DroneRotationPoint[] = [];
		const dpmSeries: DpmChartPoint[] = [];

		if (rewardTimestamps.length > 0) {
			let rotationStart =
				analyzer.startedAtLogSeconds ??
				droneTimestamps[0] ??
				Math.max(
					0,
					(analyzer.endedAtLogSeconds ?? 0) - analyzer.roundsCompleted * 300,
				);
			let droneIndex = 0;

			for (let rotation = 0; rotation < rewardTimestamps.length; rotation++) {
				const rewardTimestamp = rewardTimestamps[rotation];
				let droneCount = 0;

				while (
					droneIndex < droneTimestamps.length &&
					droneTimestamps[droneIndex] <= rewardTimestamp
				) {
					droneCount++;
					droneIndex++;
				}

				dronesPerRotation.push({
					rotation: rotation + 1,
					count: droneCount,
					fill: "hsl(0, 100%, 50%)",
				});

				const durationSeconds = Math.max(10, rewardTimestamp - rotationStart);
				dpmSeries.push({
					rotation: rotation + 1,
					dpm: Number((droneCount / (durationSeconds / 60)).toFixed(2)),
				});

				rotationStart = rewardTimestamp;
			}
		}

		if (dronesPerRotation.length > 0) {
			const counts = dronesPerRotation.map((point) => point.count);
			const min = Math.min(...counts);
			const max = Math.max(...counts);
			const range = Math.max(1, max - min);

			for (const point of dronesPerRotation) {
				const normalized = (point.count - min) / range;
				const hue = normalized * 120;
				point.fill = `hsl(${hue}, 100%, 50%)`;
			}
		}

		const dpmAverage =
			dpmSeries.length > 0
				? dpmSeries.reduce((sum, point) => sum + point.dpm, 0) /
					dpmSeries.length
				: null;
		const dpmMinFloor =
			dpmSeries.length > 0
				? Math.floor(Math.min(...dpmSeries.map((point) => point.dpm)))
				: null;

		return {
			isDefense,
			wavesPerRotation,
			totalEnemies,
			effectiveDroneKills,
			killsPerDrone,
			scenarios,
			grandMean,
			vitusPerMinute,
			actualVitusLuck,
			saturationData,
			thresholdPercent,
			dpmSeries,
			dpmAverage,
			dpmMinFloor,
			dronesPerRotation,
		};
	}, [actualDroneInput, actualVitusInput, analyzer]);

	return (
		<div className="flex flex-col h-full min-h-0">
			<Card className="flex flex-col h-full min-h-0 gap-3 py-3">
				<CardHeader>
					<div className="flex items-center justify-between gap-2">
						<div>
							<CardTitle className="text-base">
								{formatNodeLabel(analyzer?.missionCode ?? "")}
							</CardTitle>
							{copyMessage ? (
								<p className="mt-1 text-xs text-muted-foreground">
									{copyMessage}
								</p>
							) : null}
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => void copyAnalyzerAsImage()}
								disabled={copyLoading}
							>
								<Copy data-icon="inline-start" />
								{copyLoading ? "Copying..." : "Copy Image"}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void refreshAnalyzer()}
								disabled={liveLoading}
							>
								{liveLoading ? (
									<RefreshCw
										data-icon="inline-start"
										className="animate-spin"
									/>
								) : (
									<RefreshCw data-icon="inline-start" />
								)}
								Refresh
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent
					ref={analyzerContentRef}
					className="flex flex-col flex-1 min-h-0 overflow-hidden"
				>
					{liveError ? (
						<p className="text-sm text-destructive">{liveError}</p>
					) : !analyzer ? (
						<p className="text-sm text-muted-foreground">
							Loading live data...
						</p>
					) : !analyzer.sessionFound ? (
						<p className="text-sm text-muted-foreground">
							No completed arbitration session found yet in the current log
							window.
						</p>
					) : (
						<ScrollArea className="flex-1 min-h-0">
							<div className="flex flex-col gap-3 pb-2 pr-1">
								<div className="grid grid-cols-1 gap-2 md:grid-cols-3 max-h-72">
									<div className="p-2 border rounded">
										<p className="text-sm text-muted-foreground">
											Total Enemies Spawned
										</p>
										<p className="text-lg font-semibold leading-tight">
											{derived?.totalEnemies ?? 0}
										</p>
									</div>
									<div className="p-2 border rounded">
										<p className="text-sm text-muted-foreground">
											Kills / Drone
										</p>
										<p className="text-lg font-semibold leading-tight">
											{derived?.killsPerDrone !== null &&
											derived?.killsPerDrone !== undefined
												? derived.killsPerDrone.toFixed(2)
												: "N/A"}
										</p>
									</div>
									<div className="p-2 border rounded">
										<p className="text-sm text-muted-foreground">
											Avg Drone Interval
										</p>
										<p className="text-lg font-semibold leading-tight">
											{analyzer.avgDroneIntervalSeconds !== null
												? `${analyzer.avgDroneIntervalSeconds.toFixed(2)}s`
												: "N/A"}
										</p>
									</div>
									<div className="p-2 border rounded">
										<p className="text-sm text-muted-foreground">Drone Kills</p>
										<p className="text-lg font-semibold leading-tight">
											{derived?.effectiveDroneKills ?? analyzer.droneKills}
										</p>
										<SelectSeparator />
										<Input
											type="number"
											min={0}
											placeholder="Enter actual drones"
											value={actualDroneInput}
											onChange={(event) =>
												setActualDroneInput(event.target.value)
											}
										/>
									</div>
									<div className="p-2 border rounded">
										<p className="text-sm text-muted-foreground">
											Vitus / Minute
										</p>
										<p className="text-lg font-semibold leading-tight">
											{derived?.vitusPerMinute !== null &&
											derived?.vitusPerMinute !== undefined
												? `${derived.vitusPerMinute.toFixed(2)}/m`
												: "X/m"}
										</p>
										<SelectSeparator />
										<Input
											type="number"
											min={0}
											placeholder="Enter actual Vitus"
											value={actualVitusInput}
											onChange={(event) =>
												setActualVitusInput(event.target.value)
											}
										/>
									</div>
									<div className="p-2 border rounded">
										<p className="text-sm text-muted-foreground">
											Total Duration
										</p>
										<p className="text-lg font-semibold leading-tight">
											{formatDuration(analyzer.durationSeconds)}
										</p>
										<p className="text-sm text-muted-foreground">
											{derived?.isDefense
												? `Total Waves: ${analyzer.roundsCompleted * (derived?.wavesPerRotation ?? 3)}`
												: `Total Rounds: ${analyzer.roundsCompleted}`}
										</p>
									</div>
								</div>

								<div className="grid min-h-0 grid-cols-1 gap-2 auto-rows-fr xl:grid-cols-2">
									<Card className="flex flex-col min-h-0 overflow-hidden h-128">
										<CardHeader>
											<CardTitle className="text-sm">
												Expected Vitus Probability
											</CardTitle>
											<p className="text-xs text-muted-foreground">
												Assuming 100% pickup rate, all buffs, and retriever mod
												active.
											</p>
										</CardHeader>
										<CardContent className="flex flex-1 min-h-0 overflow-hidden">
											<ScrollArea className="flex-1 min-h-0">
												<div className="flex flex-col gap-2 pr-1 text-sm">
													<div className="p-2 border rounded bg-muted/30">
														<p className="text-xs text-muted-foreground">
															Actual Vitus Luck
														</p>
														{derived?.actualVitusLuck ? (
															<p
																className="text-sm font-medium"
																style={{ color: derived.actualVitusLuck.color }}
															>
																{derived.actualVitusLuck.text}
															</p>
														) : (
															<p className="text-xs text-muted-foreground">
																Enter your actual Vitus above to evaluate luck.
															</p>
														)}
													</div>
													<SelectSeparator />
													<div className="grid items-center grid-cols-3">
														<span className="text-muted-foreground">
															Chance
														</span>
														<span className="text-muted-foreground">
															Total Vitus
														</span>
														<span className="text-muted-foreground">
															Luck Level
														</span>
													</div>
													<SelectSeparator />
													{derived?.scenarios.map((scenario) => (
														<div
															key={scenario.desc}
															className="grid items-center grid-cols-3"
														>
															<span className="text-muted-foreground">
																{scenario.prob}
															</span>
															<span className="font-medium">
																{scenario.score}
															</span>
															<span className="text-muted-foreground">
																{scenario.desc}
															</span>
														</div>
													))}
												</div>
											</ScrollArea>
										</CardContent>
									</Card>

									<Card className="flex flex-col min-h-0 overflow-hidden h-128">
										<CardHeader>
											<CardTitle className="text-sm">
												Enemy Saturation
											</CardTitle>
											<p className="text-xs text-muted-foreground">
												Percent of time spent at different enemy counts.
											</p>
										</CardHeader>
										<CardContent className="flex flex-col flex-1 min-h-0">
											{derived?.saturationData &&
											derived.saturationData.length > 0 ? (
												<div className="flex-1 min-h-0">
													<ResponsiveContainer width="100%" height="100%">
														<BarChart
															data={derived.saturationData}
															layout="vertical"
														>
															<CartesianGrid
																strokeDasharray="3 3"
																stroke="rgba(161, 161, 170, 0.2)"
															/>
															<XAxis
																type="number"
																domain={[0, "dataMax + 2"]}
																tickFormatter={(value) => `${value}%`}
																width={34}
																tick={{ fontSize: 11 }}
															/>
															<YAxis
																type="category"
																dataKey="label"
																tick={{ fontSize: 11 }}
																width={40}
															/>
															<Tooltip
																cursor={{ fill: "rgba(63, 63, 70, 0.35)" }}
																formatter={(value) => [
																	`${Number(value ?? 0).toFixed(1)}%`,
																	"Time",
																]}
																contentStyle={{
																	backgroundColor: "#18181b",
																	border: "1px solid #3f3f46",
																	borderRadius: "8px",
																	color: "#f4f4f5",
																}}
																labelStyle={{ color: "#f4f4f5" }}
																itemStyle={{ color: "#f4f4f5" }}
															/>
															<Bar
																dataKey="percent"
																radius={[0, 4, 4, 0]}
																isAnimationActive={false}
															>
																<LabelList
																	dataKey="percent"
																	position="right"
																	formatter={(value) =>
																		`${Number(value ?? 0).toFixed(1)}%`
																	}
																	fill="#fafafa"
																	fontSize={11}
																/>
																{derived.saturationData.map((entry) => (
																	<Cell key={entry.label} fill={entry.fill} />
																))}
															</Bar>
														</BarChart>
													</ResponsiveContainer>
												</div>
											) : (
												<p className="text-xs text-muted-foreground">
													No live enemy count data found.
												</p>
											)}
											<p className="mt-2 text-xs text-muted-foreground">
												% of total time spent with{" "}
												<span className="font-bold text-foreground">15</span> or
												more enemies alive:
											</p>
											<p
												className="mt-2 text-sm font-semibold"
												style={{
													color: getGradientColor(
														derived?.thresholdPercent ?? 0,
													),
												}}
											>
												{derived?.thresholdPercent.toFixed(1)}%
											</p>
										</CardContent>
									</Card>

									<Card className="flex flex-col min-h-0 overflow-hidden h-128">
										<CardHeader>
											<CardTitle className="text-sm">
												Drones Per Minute
											</CardTitle>
										</CardHeader>
										<CardContent className="flex flex-1 min-h-0">
											{derived?.dpmSeries && derived.dpmSeries.length > 1 ? (
												<div className="flex-1 min-h-0">
													<ResponsiveContainer width="100%" height="100%">
														<LineChart
															data={derived.dpmSeries}
															margin={{
																top: 10,
																right: 20,
																left: 2,
																bottom: 4,
															}}
														>
															<CartesianGrid
																horizontal
																vertical={false}
																strokeDasharray="3 5"
																stroke="rgba(161, 161, 170, 0.6)"
															/>
															<XAxis
																dataKey="rotation"
																tick={{ fontSize: 11 }}
																padding={{ left: 8, right: 10 }}
															/>
															<YAxis
																tick={{ fontSize: 11 }}
																width={34}
																domain={[derived.dpmMinFloor ?? 0, "auto"]}
															/>
															<Tooltip
																formatter={(value) => [
																	`${Number(value ?? 0).toFixed(2)} DPM`,
																	"Value",
																]}
																contentStyle={{
																	backgroundColor: "#18181b",
																	border: "1px solid #3f3f46",
																	borderRadius: "8px",
																	color: "#f4f4f5",
																}}
																labelStyle={{ color: "#f4f4f5" }}
																itemStyle={{ color: "#f4f4f5" }}
															/>
															{derived.dpmAverage !== null ? (
																<ReferenceLine
																	y={derived.dpmAverage}
																	stroke="#ffffff"
																	strokeDasharray="4 4"
																	label={{
																		value: `AVG ${derived.dpmAverage.toFixed(1)}`,
																		fill: "#fff",
																		position: "insideTopRight",
																		fontSize: 11,
																	}}
																/>
															) : null}
															<Line
																type="linear"
																dataKey="dpm"
																stroke="#ffcc33"
																strokeOpacity={1}
																strokeWidth={3}
																dot={{
																	r: 3,
																	fill: "#ffcc33",
																	stroke: "#ffcc33",
																}}
																activeDot={{
																	r: 5,
																	fill: "#ffe082",
																	stroke: "#ffe082",
																}}
																connectNulls
																isAnimationActive={false}
															/>
														</LineChart>
													</ResponsiveContainer>
												</div>
											) : (
												<p className="text-xs text-muted-foreground">
													Need at least 2 rotations for trend graph.
												</p>
											)}
										</CardContent>
									</Card>

									<Card className="flex flex-col min-h-0 overflow-hidden h-128">
										<CardHeader>
											<CardTitle className="text-sm">
												Drones Per Rotation
											</CardTitle>
											<p className="text-xs text-muted-foreground">
												Colors represent relative performance: Red (lowest) -
												Green (highest).
											</p>
										</CardHeader>
										<CardContent className="flex flex-1 min-h-0">
											{derived?.dronesPerRotation &&
											derived.dronesPerRotation.length > 0 ? (
												<ScrollArea className="flex-1 min-h-0">
													<ul className="flex flex-col gap-1 pr-1">
														{derived.dronesPerRotation.map((entry) => (
															<li
																key={entry.rotation}
																className="flex items-center justify-between px-2 py-1 text-sm border rounded"
															>
																<span className="text-muted-foreground">
																	Round {entry.rotation}
																</span>
																<span
																	style={{ color: entry.fill }}
																	className="font-semibold"
																>
																	{entry.count}
																</span>
															</li>
														))}
													</ul>
												</ScrollArea>
											) : (
												<p className="text-xs text-muted-foreground">
													No rotation data available.
												</p>
											)}
										</CardContent>
									</Card>
								</div>

								{analyzer.note ? (
									<p className="text-xs text-muted-foreground">
										{analyzer.note}
									</p>
								) : null}
							</div>
						</ScrollArea>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
