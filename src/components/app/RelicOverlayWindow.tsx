import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import type { RelicScanRewardValue, RelicScanTriggerSource } from "@/types";

const BASE_CARD_WIDTH_AT_2560 = 312;
const BASE_GAP_AT_2560 = 8;

function calculateDimensions(width: number, height: number): { slotWidthPx: number; gapPx: number } {
	if (width <= 0 || height <= 0) {
		return { slotWidthPx: BASE_CARD_WIDTH_AT_2560, gapPx: BASE_GAP_AT_2560 };
	}

	// Warframe's scaling isn't perfectly linear. Use an interpolated formula
	// that hits ~238px at 1920x1080 and 312px at 2560x1440.
	const slotWidthPx = Math.round(width * 0.115625 + 16);
	const widthScaling = width / 2560;
	return {
		slotWidthPx,
		gapPx: Math.round(BASE_GAP_AT_2560 * widthScaling),
	};
}

interface OverlaySetPiece {
	rewardName: string;
	displayName: string;
	imageUrl: string;
	ownedCount: number;
}

interface OverlayRewardValue extends RelicScanRewardValue {
	position?: 1 | 2 | 3 | 4;
	setPieces?: OverlaySetPiece[];
}

interface OverlayPayload {
	source: RelicScanTriggerSource;
	triggeredAt: number;
	rewardCandidates: string[];
	detectedSlotCount?: number;
	rewards?: OverlayRewardValue[];
	error?: string;
}

export function RelicOverlayWindow() {
	const [payload, setPayload] = useState<OverlayPayload | null>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [{ slotWidthPx, gapPx }, setDimensions] = useState(() =>
		calculateDimensions(window.innerWidth, window.innerHeight),
	);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let mounted = true;
		const unlistenPromise = listen<OverlayPayload>(
			"relic-scan-overlay",
			(event) => {
				if (!mounted) {
					return;
				}
				setPayload(event.payload);
				setIsVisible(true);

				if (hideTimerRef.current) {
					clearTimeout(hideTimerRef.current);
				}
				hideTimerRef.current = setTimeout(() => {
					setIsVisible(false);
				}, 15_000);
			},
		);

		return () => {
			mounted = false;
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
			void unlistenPromise.then((unlisten) => {
				unlisten();
			});
		};
	}, []);

	useEffect(() => {
		const onResize = () => {
			setDimensions(
				calculateDimensions(window.innerWidth, window.innerHeight),
			);
		};

		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
		};
	}, []);

	if (!isVisible) {
		return <div className="w-screen h-screen bg-transparent pointer-events-none" />;
	}

	return (
		<div className="relative w-screen h-screen bg-transparent pointer-events-none">
			<div
				className="absolute text-white -translate-x-1/2 border shadow-lg pointer-events-auto rounded-xl border-white/30 bg-background backdrop-blur-sm left-1/2"
				style={{
					top: `50%`,
					padding: `${gapPx}px`,
					width: payload?.rewards?.length
						? `${payload.rewards.length * slotWidthPx + (payload.rewards.length - 1) * gapPx + gapPx * 2}px`
						: "fit-content",
				}}
			>
				{payload?.error ? (
					<p className="text-base text-red-300">{payload.error}</p>
				) : payload?.rewards?.length ? (
					<div
						className={`grid w-fit mx-auto ${(() => {
							const rawCount =
								typeof payload.detectedSlotCount === "number"
									? payload.detectedSlotCount
									: Math.max(
										...payload.rewards.map((reward) => reward.position ?? 0),
										payload.rewards.length,
									);
							const slotCount = Math.min(4, Math.max(1, rawCount));
							if (slotCount === 1) {
								return "grid-cols-1";
							}
							if (slotCount === 2) {
								return "grid-cols-2";
							}
							if (slotCount === 3) {
								return "grid-cols-3";
							}
							return "grid-cols-4";
						})()}`}
						style={{ gap: `${gapPx}px` }}
					>
						{(() => {
							const rewardNameCounts = new Map<string, number>();
							for (const reward of payload.rewards) {
								rewardNameCounts.set(
									reward.rewardName,
									(rewardNameCounts.get(reward.rewardName) ?? 0) + 1,
								);
							}

							const rawCount =
								typeof payload.detectedSlotCount === "number"
									? payload.detectedSlotCount
									: Math.max(
										...payload.rewards.map((reward) => reward.position ?? 0),
										payload.rewards.length,
									);
							const slotCount = Math.min(4, Math.max(1, rawCount));

							const positionedRewards: Array<OverlayRewardValue | null> =
								Array.from({ length: slotCount }, () => null);
							const unpositionedRewards: OverlayRewardValue[] = [];

							for (const reward of payload.rewards) {
								const slotIndex =
									typeof reward.position === "number"
										? reward.position - 1
										: -1;

								if (
									slotIndex >= 0 &&
									slotIndex < slotCount &&
									positionedRewards[slotIndex] === null
								) {
									positionedRewards[slotIndex] = reward;
								} else {
									unpositionedRewards.push(reward);
								}
							}

							for (
								let index = 0;
								index < slotCount && unpositionedRewards.length > 0;
								index += 1
							) {
								if (positionedRewards[index] === null) {
									const nextReward = unpositionedRewards.shift();
									if (nextReward) {
										positionedRewards[index] = nextReward;
									}
								}
							}

							return positionedRewards.map((reward, slotIndex) => {
								if (!reward) {
									return (
										<div
											key={`${payload.triggeredAt}-empty-${slotIndex}`}
											className="box-border px-3 py-3 border rounded border-white/10 bg-white/5"
											style={{ width: `${slotWidthPx}px` }}
										/>
									);
								}

								const setPieces = reward.setPieces ?? [];
								const duplicateCount = rewardNameCounts.get(reward.rewardName) ?? 1;
								const rewardTitle =
									duplicateCount > 1
										? `${duplicateCount}x ${reward.displayName}`
										: reward.displayName;

							return (
								<div
									key={`${payload.triggeredAt}-${slotIndex}-${reward.rewardName}`}
									className="box-border px-3 py-3 text-center border rounded border-white/20 bg-white/10"
									style={{ width: `${slotWidthPx}px` }}
								>
									<p className="text-lg font-semibold leading-tight">{rewardTitle}</p>
									<div className="flex items-center justify-center gap-4 mt-2 text-lg text-white/90">
										<span className="inline-flex items-center gap-1">
											<img alt="Platinum" className="size-6" src="/PlatinumLarge.png" />
											{reward.platinum.toFixed(2)}
										</span>
										<span className="inline-flex items-center gap-1">
											<img alt="Ducats" className="size-6.5" src="/OrokinDucats.png" />
											{reward.ducats}
										</span>
									</div>
									{setPieces.length ? (
										<div className="mt-3">
											<div className="flex justify-center mt-2">
												<div className="inline-grid grid-cols-3 gap-2">
													{setPieces.map((piece) => (
														<div
															key={`${reward.rewardName}-${piece.rewardName}`}
															className="relative flex justify-center group"
															title={`${piece.displayName}: owned ${piece.ownedCount}`}
														>
															<img
																alt={piece.displayName}
																className={`w-15 aspect-square rounded object-cover ${piece.ownedCount > 0 ? "border-2 border-green-500/50" : "border-2 border-muted opacity-50"}`}
																src={piece.imageUrl}
															/>
															<span className="absolute -bottom-1 left-1/2 min-w-5 h-5 px-1 rounded bg-secondary text-secondary-foreground text-[16px] flex items-center justify-center -translate-x-1/2">
																x{piece.ownedCount}
															</span>
															<span className="absolute px-2 py-1 mb-2 text-xs transition-opacity transform -translate-x-1/2 rounded opacity-0 pointer-events-none bottom-full left-1/2 bg-popover text-popover-foreground whitespace-nowrap group-hover:opacity-100">
																{piece.displayName}
															</span>
														</div>
													))}
												</div>
											</div>
										</div>
									) : null}
								</div>
							);
							});
						})()}
					</div>
				) : payload ? (
					<div className="mt-2 space-y-1">
						<p className="text-base text-white/75">No rewards resolved for this scan.</p>
						{payload.rewardCandidates?.length ? (
							<p className="font-mono text-sm truncate text-white/60">
								OCR: {payload.rewardCandidates.join(" | ")}
							</p>
						) : null}
					</div>
				) : (
					<p className="mt-2 text-base text-white/75">Waiting for scan results...</p>
				)}
			</div>
		</div>
	);
}
