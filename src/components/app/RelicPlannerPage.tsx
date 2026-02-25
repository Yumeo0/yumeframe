import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { OwnedRelic } from "@/types";

interface RelicPlannerPageProps {
	inventory: string;
	relics: OwnedRelic[];
	onVisibleRewardsChange?: (rewardNames: string[]) => void;
}

function rarityOrder(rarity: string): number {
	switch (rarity) {
		case "COMMON":
			return 0;
		case "UNCOMMON":
			return 1;
		default:
			return 2;
	}
}

function rewardRarityClasses(rarity: string): string {
	switch (rarity) {
		case "RARE":
			return "border-amber-500/70 bg-amber-500/15";
		case "UNCOMMON":
			return "border-slate-400/70 bg-slate-400/15";
		default:
			return "border-orange-500/70 bg-orange-500/15";
	}
}

export function RelicPlannerPage({
	inventory,
	relics,
	onVisibleRewardsChange,
}: RelicPlannerPageProps) {
	const gridRef = useRef<HTMLDivElement | null>(null);
	const relicRewardNamesByRelic = useMemo(
		() =>
			new Map(
				relics.map((relic) => [
					relic.uniqueName,
					relic.relicRewards.map((reward) => reward.rewardName),
				]),
			),
		[relics],
	);

	useEffect(() => {
		if (!onVisibleRewardsChange) {
			return;
		}

		if (!gridRef.current) {
			onVisibleRewardsChange([]);
			return;
		}

		const viewport = gridRef.current.closest("[data-slot='scroll-area-viewport']");
		if (!(viewport instanceof HTMLElement)) {
			onVisibleRewardsChange([]);
			return;
		}

		const visibleRelics = new Set<string>();

		const notifyVisibleRewards = () => {
			const rewardNames = new Set<string>();
			for (const relicUniqueName of visibleRelics) {
				const rewardNamesForRelic = relicRewardNamesByRelic.get(relicUniqueName) ?? [];
				for (const rewardName of rewardNamesForRelic) {
					rewardNames.add(rewardName);
				}
			}

			onVisibleRewardsChange([...rewardNames]);
		};

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const relicUniqueName = (entry.target as HTMLElement).dataset.relicUniqueName;
					if (!relicUniqueName) {
						continue;
					}

					if (entry.isIntersecting) {
						visibleRelics.add(relicUniqueName);
					} else {
						visibleRelics.delete(relicUniqueName);
					}
				}

				notifyVisibleRewards();
			},
			{
				root: viewport,
				threshold: 0.05,
			},
		);

		const cards = gridRef.current.querySelectorAll<HTMLElement>("[data-relic-unique-name]");
		for (const card of cards) {
			observer.observe(card);
		}

		notifyVisibleRewards();

		return () => {
			observer.disconnect();
		};
	}, [onVisibleRewardsChange, relicRewardNamesByRelic]);

	if (!inventory) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Relic Planner</CardTitle>
					<CardDescription>
						Load your inventory first from the Foundry tab.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0 gap-2">
			<ScrollArea className="h-full rounded-md">
				{relics.length === 0 ? (
					<div className="p-6 text-center text-muted-foreground">
						No relics found in `MiscItems`.
					</div>
				) : (
					<div
						className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
						ref={gridRef}
					>
						{relics.map((relic) => (
							<Card
								key={relic.uniqueName}
								className="gap-0 py-3"
								data-relic-unique-name={relic.uniqueName}
							>
								<CardHeader className="pb-2">
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center min-w-0 gap-2">
											<img
												src={relic.imageUrl}
												alt={relic.name}
												className="object-cover w-12 h-12 rounded shrink-0"
											/>
											<div className="min-w-0">
												<CardTitle className="text-base leading-tight truncate">
													{relic.name}
												</CardTitle>
												<div className="mt-1 flex items-center gap-1.5">
													<Badge variant="outline">
														{relic.refinement} (Lvl {relic.refinementLevel})
													</Badge>
												</div>
											</div>
										</div>
										<Badge variant="secondary" className="text-sm">x{relic.count}</Badge>
									</div>
								</CardHeader>
								<CardContent>
									<div className="flex items-start h-full gap-2">
										<div className="flex flex-col items-center justify-center h-full space-y-2 w-28 shrink-0">
											<div className="flex justify-end text-center">
												<p className="text-lg font-semibold">
													{relic.expectedDucats.toFixed(2)}
												</p>
												<img src="/OrokinDucats.png" alt="Ducats" className="w-8 h-8" />
											</div>
											<div className="flex items-center justify-end text-center">
												{relic.isPlatinumReady ? (
													<p className="text-lg font-semibold">
														{relic.expectedPlatinum.toFixed(2)}
													</p>
												) : (
													<span
														className="inline-block w-4 h-4 border-2 rounded-full border-muted-foreground/50 border-t-transparent animate-spin"
														aria-label="Loading platinum"
													/>
												)}
												<img src="/PlatinumLarge.png" alt="Platinum" className="w-6 h-6 mx-1" />
											</div>
										</div>
										<div className="grid flex-1 grid-cols-3 gap-2">
											{[...relic.relicRewards]
												.sort((a, b) => {
													const rarityDiff =
														rarityOrder(a.rarity) - rarityOrder(b.rarity);
													if (rarityDiff !== 0) {
														return rarityDiff;
													}
													return a.rewardName.localeCompare(b.rewardName);
												})
												.map((reward) => (
													<div
														key={`${relic.uniqueName}-${reward.rewardName}`}
														className={`relative rounded border p-1 ${rewardRarityClasses(reward.rarity)}`}
														title={`${reward.rewardName.split("/").pop() || reward.rewardName} (${reward.rarity})${reward.itemCount > 1 ? ` x${reward.itemCount}` : ""}${reward.ducats > 0 ? ` • ${reward.ducats} ducats` : ""}${reward.platinum > 0 ? ` • ${reward.platinum} platinum` : ""}`}
													>
														{reward.imageUrl ? (
															<img
																src={reward.imageUrl}
																alt={
																	reward.rewardName.split("/").pop() ||
																	reward.rewardName
																}
																className="object-cover w-12 h-12 mx-auto rounded"
															/>
														) : (
															<div className="w-12 h-12 mx-auto rounded bg-muted" />
														)}
														{reward.itemCount > 1 ? (
															<span className="absolute -bottom-1 -right-1 rounded bg-secondary px-1 text-[10px] text-secondary-foreground">
																x{reward.itemCount}
															</span>
														) : null}
													</div>
												))}
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}
