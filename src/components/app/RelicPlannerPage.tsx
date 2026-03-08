import { useStore } from "@tanstack/react-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateExpectedDucats, calculateExpectedPlatinum } from "@/lib/relics.utils";
import { appStore, setAppVisibleRewardNames } from "@/store/appStore";
import type { OwnedRelic, OwnedRelicReward } from "@/types";

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

type RelicSortKey =
	| "platinum-profit"
	| "ducats-profit"
	| "missing-items"
	| "name"
	| "amount"
	| "upgrade-platinum"
	| "upgrade-ducats";

const DEFAULT_RELIC_SORT: RelicSortKey = "platinum-profit";
const RELIC_DAILY_MARKET_CACHE_KEY = "yumeframe.relic.daily.market.cache";

interface DailyMarketVaultLookup {
	vaultedBySlug: Record<string, boolean>;
	vaultedByName: Record<string, boolean>;
	slugByName: Record<string, string>;
}

function normalizeRewardGameRef(gameRef: string): string {
	return gameRef.replace("/StoreItems", "");
}

function normalizeMarketName(value: string): string {
	return value
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function slugifyMarketName(value: string): string {
	return normalizeMarketName(value).replace(/\s+/g, "_");
}

function getSingleRollRewardProbabilities(
	rewards: OwnedRelicReward[],
	refinementLevel: 0 | 1 | 2 | 3,
): number[] {
	const chanceByRarity = {
		0: { COMMON: 0.76, UNCOMMON: 0.22, RARE: 0.02 },
		1: { COMMON: 0.7, UNCOMMON: 0.26, RARE: 0.04 },
		2: { COMMON: 0.6, UNCOMMON: 0.34, RARE: 0.06 },
		3: { COMMON: 0.5, UNCOMMON: 0.4, RARE: 0.1 },
	} as const;

	const rarityCounts = {
		COMMON: rewards.filter((reward) => reward.rarity === "COMMON").length,
		UNCOMMON: rewards.filter((reward) => reward.rarity === "UNCOMMON").length,
		RARE: rewards.filter((reward) => reward.rarity === "RARE").length,
	};

	return rewards.map((reward) => {
		if (reward.rarity === "COMMON" && rarityCounts.COMMON > 0) {
			return chanceByRarity[refinementLevel].COMMON / rarityCounts.COMMON;
		}
		if (reward.rarity === "UNCOMMON" && rarityCounts.UNCOMMON > 0) {
			return chanceByRarity[refinementLevel].UNCOMMON / rarityCounts.UNCOMMON;
		}
		if (rarityCounts.RARE > 0) {
			return chanceByRarity[refinementLevel].RARE / rarityCounts.RARE;
		}
		return 0;
	});
}

function expectedBestOfN(values: number[], probabilities: number[], picks: number): number {
	if (values.length === 0 || probabilities.length === 0 || picks <= 0) {
		return 0;
	}

	const byValue = new Map<number, number>();
	for (let i = 0; i < values.length; i += 1) {
		const value = values[i] ?? 0;
		const probability = probabilities[i] ?? 0;
		byValue.set(value, (byValue.get(value) ?? 0) + probability);
	}

	const sortedValues = [...byValue.keys()].sort((a, b) => a - b);
	let cumulativeProbability = 0;
	let previousMaxProbability = 0;
	let expected = 0;

	for (const value of sortedValues) {
		cumulativeProbability += byValue.get(value) ?? 0;
		const maxProbability = cumulativeProbability ** picks;
		expected += value * (maxProbability - previousMaxProbability);
		previousMaxProbability = maxProbability;
	}

	return Math.round(expected * 100) / 100;
}

function isWarframeMastered(xp: number, maxLevel: number): boolean {
	const cappedLevel = maxLevel > 30 ? 40 : 30;
	const required = 1000 * cappedLevel ** 2;
	return xp >= required;
}

function isWeaponMastered(
	xp: number,
	maxLevelCap: number | undefined,
	uniqueName: string,
): boolean {
	const lowerUniqueName = uniqueName.toLowerCase();
	const hasExtendedCap =
		(maxLevelCap ?? 30) > 30 ||
		lowerUniqueName.includes("kuva") ||
		lowerUniqueName.includes("tenet") ||
		lowerUniqueName.includes("coda") ||
		lowerUniqueName.includes("paracesis");
	const cappedLevel = hasExtendedCap ? 40 : 30;
	const required = (1000 * cappedLevel ** 2) / 2;
	return xp >= required;
}

function isCompanionMastered(xp: number): boolean {
	const required = 1000 * 30 ** 2;
	return xp >= required;
}

function isRelicVaultedFromDailyCache(
	relicName: string,
	vaultLookup: DailyMarketVaultLookup,
): boolean {
	const normalizedName = normalizeMarketName(relicName);
	const byName = vaultLookup.vaultedByName[normalizedName];
	if (byName !== undefined) {
		return byName;
	}

	const mappedSlug = vaultLookup.slugByName[normalizedName];
	if (mappedSlug) {
		return vaultLookup.vaultedBySlug[mappedSlug] === true;
	}

	const directSlug = slugifyMarketName(relicName);
	return vaultLookup.vaultedBySlug[directSlug] === true;
}

function refinementLabel(refinement: OwnedRelic["refinement"]): string {
	if (refinement === "Unleveled") {
		return "Intact";
	}
	return refinement;
}

export function RelicPlannerPage() {
	const inventory = useStore(appStore, (state) => state.inventory);
	const relics = useStore(appStore, (state) => state.relics);
	const warframes = useStore(appStore, (state) => state.warframes);
	const weapons = useStore(appStore, (state) => state.weapons);
	const companions = useStore(appStore, (state) => state.companions);
	const gridRef = useRef<HTMLDivElement | null>(null);
	const [showVaultedOnly, setShowVaultedOnly] = useState(false);
	const [showAllRewardsOwnedOnly, setShowAllRewardsOwnedOnly] = useState(false);
	const [showAllItemsMasteredOrOwnedOnly, setShowAllItemsMasteredOrOwnedOnly] =
		useState(false);
	const [showAtLeastTenCopiesOnly, setShowAtLeastTenCopiesOnly] = useState(false);
	const [tierFilter, setTierFilter] = useState<"all" | OwnedRelic["refinement"]>("all");
	const [sortKey, setSortKey] = useState<RelicSortKey>(DEFAULT_RELIC_SORT);
	const [squadSize, setSquadSize] = useState<1 | 2 | 3 | 4>(4);

	const ownedRewardCounts = useMemo(() => {
		const ownedCounts = new Map<string, number>();
		if (!inventory?.trim()) {
			return ownedCounts;
		}

		try {
			const inventoryData = JSON.parse(inventory) as Record<string, unknown>;
			const addOwnedType = (rawType: unknown, count = 1) => {
				if (typeof rawType !== "string" || !rawType.trim() || count <= 0) {
					return;
				}

				const normalized = normalizeRewardGameRef(rawType);
				ownedCounts.set(normalized, (ownedCounts.get(normalized) ?? 0) + count);
			};

			const recipeEntries =
				(inventoryData.Recipes as Array<{ ItemType?: string; ItemCount?: number }> | undefined) ?? [];
			for (const entry of recipeEntries) {
				addOwnedType(entry.ItemType, Math.max(1, entry.ItemCount ?? 1));
			}

			const miscEntries =
				(inventoryData.MiscItems as Array<{ ItemType?: string; ItemCount?: number }> | undefined) ?? [];
			for (const entry of miscEntries) {
				addOwnedType(entry.ItemType, entry.ItemCount ?? 0);
			}

			const inventoryKeys = [
				"Suits",
				"SpaceSuits",
				"Pistols",
				"LongGuns",
				"Melee",
				"SpaceGuns",
				"SpaceMelee",
				"SentinelWeapons",
				"OperatorAmps",
				"Sentinels",
				"KubrowPets",
				"MoaPets",
				"InfestedPets",
			] as const;

			for (const key of inventoryKeys) {
				const entries =
					(inventoryData[key] as Array<{ ItemType?: string }> | undefined) ?? [];
				for (const entry of entries) {
					addOwnedType(entry.ItemType, 1);
				}
			}
		} catch (error) {
			console.error("Failed to derive reward ownership from inventory:", error);
		}

		return ownedCounts;
	}, [inventory]);

	const masteredOrOwnedTypes = useMemo(() => {
		const set = new Set<string>();

		for (const warframe of warframes) {
			const normalizedType = normalizeRewardGameRef(warframe.type);
			if (warframe.owned || isWarframeMastered(warframe.xp, warframe.maxLevel)) {
				set.add(normalizedType);
			}
		}

		for (const weapon of weapons) {
			const normalizedType = normalizeRewardGameRef(weapon.type);
			if (
				weapon.owned ||
				isWeaponMastered(weapon.xp, weapon.maxLevelCap, weapon.uniqueName)
			) {
				set.add(normalizedType);
			}
		}

		for (const companion of companions) {
			const normalizedType = normalizeRewardGameRef(companion.type);
			if (companion.owned || isCompanionMastered(companion.xp)) {
				set.add(normalizedType);
			}
		}

		return set;
	}, [warframes, weapons, companions]);

	const dailyMarketVaultLookup = useMemo<DailyMarketVaultLookup>(() => {
		const emptyLookup: DailyMarketVaultLookup = {
			vaultedBySlug: {},
			vaultedByName: {},
			slugByName: {},
		};

		try {
			const raw = localStorage.getItem(RELIC_DAILY_MARKET_CACHE_KEY);
			if (!raw) {
				return emptyLookup;
			}

			const parsed = JSON.parse(raw) as Partial<DailyMarketVaultLookup>;
			return {
				vaultedBySlug: parsed.vaultedBySlug ?? {},
				vaultedByName: parsed.vaultedByName ?? {},
				slugByName: parsed.slugByName ?? {},
			};
		} catch (error) {
			console.error("Failed to read daily market vaulted cache:", error);
			return emptyLookup;
		}
	}, [relics]);

	const rewardVaultState = useMemo(() => {
		const byRewardName = new Map<string, { total: number; vaulted: number }>();

		for (const relic of relics) {
			const relicVaulted = isRelicVaultedFromDailyCache(
				relic.name,
				dailyMarketVaultLookup,
			);
			for (const reward of relic.relicRewards) {
				const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
				const current = byRewardName.get(normalizedRewardName) ?? {
					total: 0,
					vaulted: 0,
				};
				current.total += 1;
				if (relicVaulted) {
					current.vaulted += 1;
				}
				byRewardName.set(normalizedRewardName, current);
			}
		}

		return byRewardName;
	}, [relics, dailyMarketVaultLookup]);

	const relicMeta = useMemo(() => {
		return new Map(
			relics.map((relic) => {
				const relicVaulted = isRelicVaultedFromDailyCache(
					relic.name,
					dailyMarketVaultLookup,
				);
				const singleRollProbabilities = getSingleRollRewardProbabilities(
					relic.relicRewards,
					relic.refinementLevel,
				);
				const ducatValues = relic.relicRewards.map((reward) => reward.ducats);
				const platinumValues = relic.relicRewards.map(
					(reward) => reward.platinum * reward.itemCount,
				);

				const expectedDucatsBySquad = expectedBestOfN(
					ducatValues,
					singleRollProbabilities,
					squadSize,
				);
				const expectedPlatinumBySquad = relic.isPlatinumReady
					? expectedBestOfN(platinumValues, singleRollProbabilities, squadSize)
					: 0;

				const radiantExpectedDucats = calculateExpectedDucats(
					relic.relicRewards,
					3,
				);
				const radiantExpectedPlatinum = relic.isPlatinumReady
					? calculateExpectedPlatinum(relic.relicRewards, 3)
					: 0;

				const allRewardsOwned = relic.relicRewards.every((reward) => {
					const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
					return (ownedRewardCounts.get(normalizedRewardName) ?? 0) > 0;
				});

				const allItemsMasteredOrOwned = relic.relicRewards.every((reward) => {
					const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
					if ((ownedRewardCounts.get(normalizedRewardName) ?? 0) > 0) {
						return true;
					}
					return masteredOrOwnedTypes.has(normalizedRewardName);
				});

				const missingItemsCount = relic.relicRewards.filter((reward) => {
					const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
					if ((ownedRewardCounts.get(normalizedRewardName) ?? 0) > 0) {
						return false;
					}
					return !masteredOrOwnedTypes.has(normalizedRewardName);
				}).length;

				return [
					relic.uniqueName,
					{
						expectedDucatsBySquad,
						expectedPlatinumBySquad,
						upgradeDeltaDucats: Math.max(
							0,
							radiantExpectedDucats - relic.expectedDucats,
						),
						upgradeDeltaPlatinum: Math.max(
							0,
							radiantExpectedPlatinum - relic.expectedPlatinum,
						),
						allRewardsOwned,
						allItemsMasteredOrOwned,
						missingItemsCount,
						vaulted: relicVaulted,
					},
				] as const;
			}),
		);
	}, [
		relics,
		ownedRewardCounts,
		masteredOrOwnedTypes,
		dailyMarketVaultLookup,
		rewardVaultState,
		squadSize,
	]);

	const filteredAndSortedRelics = useMemo(() => {
		const filtered = relics.filter((relic) => {
			const meta = relicMeta.get(relic.uniqueName);
			if (!meta) {
				return false;
			}

			if (showVaultedOnly && !meta.vaulted) {
				return false;
			}
			if (showAllRewardsOwnedOnly && !meta.allRewardsOwned) {
				return false;
			}
			if (showAllItemsMasteredOrOwnedOnly && !meta.allItemsMasteredOrOwned) {
				return false;
			}
			if (showAtLeastTenCopiesOnly && relic.count < 10) {
				return false;
			}
			if (tierFilter !== "all" && relic.refinement !== tierFilter) {
				return false;
			}

			return true;
		});

		return [...filtered].sort((a, b) => {
			const metaA = relicMeta.get(a.uniqueName);
			const metaB = relicMeta.get(b.uniqueName);
			if (!metaA || !metaB) {
				return 0;
			}

			switch (sortKey) {
				case "platinum-profit":
					return (
						metaB.expectedPlatinumBySquad - metaA.expectedPlatinumBySquad ||
						b.expectedDucats - a.expectedDucats ||
						a.name.localeCompare(b.name)
					);
				case "ducats-profit":
					return (
						metaB.expectedDucatsBySquad - metaA.expectedDucatsBySquad ||
						metaB.expectedPlatinumBySquad - metaA.expectedPlatinumBySquad ||
						a.name.localeCompare(b.name)
					);
				case "missing-items":
					return (
						metaB.missingItemsCount - metaA.missingItemsCount ||
						metaB.expectedPlatinumBySquad - metaA.expectedPlatinumBySquad ||
						a.name.localeCompare(b.name)
					);
				case "name":
					return (
						a.name.localeCompare(b.name) ||
						b.refinementLevel - a.refinementLevel
					);
				case "amount":
					return b.count - a.count || a.name.localeCompare(b.name);
				case "upgrade-platinum":
					return (
						metaB.upgradeDeltaPlatinum - metaA.upgradeDeltaPlatinum ||
						metaB.expectedPlatinumBySquad - metaA.expectedPlatinumBySquad ||
						a.name.localeCompare(b.name)
					);
				case "upgrade-ducats":
					return (
						metaB.upgradeDeltaDucats - metaA.upgradeDeltaDucats ||
						metaB.expectedDucatsBySquad - metaA.expectedDucatsBySquad ||
						a.name.localeCompare(b.name)
					);
				default:
					return 0;
			}
		});
	}, [
		relics,
		relicMeta,
		showVaultedOnly,
		showAllRewardsOwnedOnly,
		showAllItemsMasteredOrOwnedOnly,
		showAtLeastTenCopiesOnly,
		tierFilter,
		sortKey,
	]);
	const relicRewardNamesByRelic = useMemo(
		() =>
			new Map(
				filteredAndSortedRelics.map((relic) => [
					relic.uniqueName,
					relic.relicRewards.map((reward) => reward.rewardName),
				]),
			),
		[filteredAndSortedRelics],
	);

	useEffect(() => {
		if (!gridRef.current) {
			setAppVisibleRewardNames([]);
			return;
		}

		const viewport = gridRef.current.closest(
			"[data-slot='scroll-area-viewport']",
		);
		if (!(viewport instanceof HTMLElement)) {
			setAppVisibleRewardNames([]);
			return;
		}

		const visibleRelics = new Set<string>();

		const notifyVisibleRewards = () => {
			const rewardNames = new Set<string>();
			for (const relicUniqueName of visibleRelics) {
				const rewardNamesForRelic =
					relicRewardNamesByRelic.get(relicUniqueName) ?? [];
				for (const rewardName of rewardNamesForRelic) {
					rewardNames.add(rewardName);
				}
			}

			setAppVisibleRewardNames((previous) => {
				const normalized = [...rewardNames].sort();
				if (
					previous.length === normalized.length &&
					previous.every((value, index) => value === normalized[index])
				) {
					return previous;
				}
				return normalized;
			});
		};

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const relicUniqueName = (entry.target as HTMLElement).dataset
						.relicUniqueName;
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

		const cards = gridRef.current.querySelectorAll<HTMLElement>(
			"[data-relic-unique-name]",
		);
		for (const card of cards) {
			observer.observe(card);
		}

		notifyVisibleRewards();

		return () => {
			observer.disconnect();
		};
	}, [relicRewardNamesByRelic]);

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
			<Card className="py-3">
				<CardContent className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant={showVaultedOnly ? "default" : "outline"}
							onClick={() => setShowVaultedOnly((previous) => !previous)}
						>
							Vaulted
						</Button>
						<Button
							type="button"
							size="sm"
							variant={showAllRewardsOwnedOnly ? "default" : "outline"}
							onClick={() => setShowAllRewardsOwnedOnly((previous) => !previous)}
						>
							All rewards owned
						</Button>
						<Button
							type="button"
							size="sm"
							variant={showAllItemsMasteredOrOwnedOnly ? "default" : "outline"}
							onClick={() =>
								setShowAllItemsMasteredOrOwnedOnly((previous) => !previous)
							}
						>
							All items mastered/owned
						</Button>
						<Button
							type="button"
							size="sm"
							variant={showAtLeastTenCopiesOnly ? "default" : "outline"}
							onClick={() => setShowAtLeastTenCopiesOnly((previous) => !previous)}
						>
							{">= 10 copies"}
						</Button>
					</div>

					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
						<label className="flex items-center justify-between gap-2 text-sm">
							<span className="text-muted-foreground">Relic tier</span>
							<select
								className="h-8 px-2 text-sm border rounded-md bg-background"
								value={tierFilter}
								onChange={(event) =>
									setTierFilter(event.target.value as "all" | OwnedRelic["refinement"])
								}
							>
								<option value="all">All</option>
								<option value="Unleveled">Intact</option>
								<option value="Exceptional">Exceptional</option>
								<option value="Flawless">Flawless</option>
								<option value="Radiant">Radiant</option>
							</select>
						</label>

						<label className="flex items-center justify-between gap-2 text-sm">
							<span className="text-muted-foreground">Sort</span>
							<select
								className="h-8 px-2 text-sm border rounded-md bg-background"
								value={sortKey}
								onChange={(event) =>
									setSortKey(event.target.value as RelicSortKey)
								}
							>
								<option value="platinum-profit">Platinum profit</option>
								<option value="ducats-profit">Ducats profit</option>
								<option value="missing-items">Missing items (best for MR)</option>
								<option value="name">Name</option>
								<option value="amount">Amount</option>
								<option value="upgrade-platinum">Best to upgrade - platinum</option>
								<option value="upgrade-ducats">Best to upgrade - ducats</option>
							</select>
						</label>

						<label className="flex items-center justify-between gap-2 text-sm">
							<span className="text-muted-foreground">Squad size</span>
							<select
								className="h-8 px-2 text-sm border rounded-md bg-background"
								value={String(squadSize)}
								onChange={(event) => {
									const parsed = Number(event.target.value);
									if (parsed >= 1 && parsed <= 4) {
										setSquadSize(parsed as 1 | 2 | 3 | 4);
									}
								}}
							>
								<option value="1">1</option>
								<option value="2">2</option>
								<option value="3">3</option>
								<option value="4">4</option>
							</select>
						</label>

						<div className="flex items-center text-xs text-muted-foreground">
							Showing {filteredAndSortedRelics.length} / {relics.length} relics
						</div>
					</div>
				</CardContent>
			</Card>
			<ScrollArea className="h-full rounded-md">
				{filteredAndSortedRelics.length === 0 ? (
					<div className="p-6 text-center text-muted-foreground">
						No relics match the selected filters.
					</div>
				) : (
					<div
						className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
						ref={gridRef}
					>
						{filteredAndSortedRelics.map((relic) => {
							const meta = relicMeta.get(relic.uniqueName);
							const expectedDucats = meta?.expectedDucatsBySquad ?? relic.expectedDucats;
							const expectedPlatinum =
								meta?.expectedPlatinumBySquad ?? relic.expectedPlatinum;

							return (
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
														{refinementLabel(relic.refinement)} (Lvl {relic.refinementLevel})
													</Badge>
													{meta?.vaulted ? <Badge variant="secondary">Vaulted</Badge> : null}
												</div>
											</div>
										</div>
										<Badge variant="secondary" className="text-sm">
											x{relic.count}
										</Badge>
									</div>
								</CardHeader>
								<CardContent>
									<div className="flex items-start h-full gap-2">
										<div className="flex flex-col items-center justify-center h-full space-y-2 w-28 shrink-0">
											<div className="flex justify-end text-center">
												<p className="text-lg font-semibold">
													{expectedDucats.toFixed(2)}
												</p>
												<img
													src="/OrokinDucats.png"
													alt="Ducats"
													className="w-8 h-8"
												/>
											</div>
											<div className="flex items-center justify-end text-center">
												{relic.isPlatinumReady ? (
													<p className="text-lg font-semibold">
														{expectedPlatinum.toFixed(2)}
													</p>
												) : (
													<span
														className="inline-block w-4 h-4 border-2 rounded-full border-muted-foreground/50 border-t-transparent animate-spin"
													/>
												)}
												<img
													src="/PlatinumLarge.png"
													alt="Platinum"
													className="w-6 h-6 mx-1"
												/>
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
																		title={`${reward.rewardName.split("/").pop() || reward.rewardName} (${reward.rarity})${reward.itemCount > 1 ? ` x${reward.itemCount}` : ""}${reward.ducats > 0 ? ` • ${reward.ducats} ducats` : ""}${reward.platinum > 0 ? ` • ${reward.platinum} platinum` : ""}${(() => {
																			const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
																			const rewardState = rewardVaultState.get(normalizedRewardName);
																			if (!rewardState || rewardState.total === 0) {
																				return "";
																			}
																			return rewardState.vaulted === rewardState.total ? " • Vaulted reward" : "";
																		})()}`}
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
															<span className="absolute -bottom-1 -right-1 rounded bg-secondary px-1 text-[14px] text-secondary-foreground">
																x{reward.itemCount}
															</span>
														) : null}
													</div>
												))}
										</div>
									</div>
								</CardContent>
							</Card>
							);
						})}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}
