import { useStore } from "@tanstack/react-store";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoundryPage } from "@/components/app/FoundryPage";
import { MasteryHelperPage } from "@/components/app/MasteryHelperPage";
import { RelicPlannerPage } from "@/components/app/RelicPlannerPage";
import { RelicScannerPage } from "@/components/app/RelicScannerPage";
import { SettingsPage } from "@/components/app/SettingsPage";
import {
	type SettingsSection,
	SettingsSidebar,
} from "@/components/app/SettingsSidebar";
import { Sidebar } from "@/components/app/Sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useData } from "@/hooks/useData";
import { useInventory } from "@/hooks/useInventory";
import {
	calculateExpectedDucats,
	calculateExpectedPlatinum,
} from "@/lib/relics.utils";
import {
	appStore,
	setAppActiveTab,
	setAppCompanions,
	setAppEeLogPath,
	setAppPendingRecipes,
	setAppRelicOverlayEnabled,
	setAppRelicScannerEnabled,
	setAppRelicScannerHotkey,
	setAppRelicScannerStatus,
	setAppRelicScans,
	setAppRelics,
	setAppRewardPlatinumFetchedAt,
	setAppRewardPlatinumValues,
	setAppWarframes,
	setAppWeapons,
} from "@/store/appStore";
import type {
	InventoryCompanionEntry,
	InventoryMiscItem,
	InventoryPendingRecipeEntry,
	InventoryWeaponEntry,
	ManifestEntry,
	OwnedCompanion,
	OwnedRelic,
	OwnedWeapon,
	PendingRecipe,
	RelicScanEntry,
	RelicScanRewardValue,
	RelicScanStatus,
	RelicScanTriggerSource,
	VoidRelic,
	Warframe,
	WarframePart,
	WarframeSuit,
} from "@/types";

const RELIC_PRICE_CACHE_KEY = "yumeframe.relic.price.cache";
const RELIC_DAILY_MARKET_CACHE_KEY = "yumeframe.relic.daily.market.cache";
const RELIC_SCANNER_SETTINGS_CACHE_KEY = "yumeframe.relic.scanner.settings";
const EE_LOG_PATH_CACHE_KEY = "yumeframe.ee-log.path";
const RELIC_IMAGE_TEST_PATH_CACHE_KEY = "yumeframe.relic.image-test.path";
const DEFAULT_RELIC_SCANNER_HOTKEY = "F11";
const LEGACY_RELIC_SCANNER_HOTKEY = "F12";
const WFM_DAILY_MARKET_PRICES_URL =
	"https://raw.githubusercontent.com/Yumeo0/wfmarket-prices/refs/heads/main/data/warframe-market-prices.json";

interface MarketTopOrders {
	buy?: Array<{ platinum: number }>;
	sell?: Array<{ platinum: number }>;
}

interface DailyMarketPriceItem {
	slug: string;
	itemName: string;
	vaulted?: boolean;
	topOrders?: MarketTopOrders;
}

interface DailyMarketPricePayload {
	generatedAt?: string;
	items?: DailyMarketPriceItem[];
}

interface DailyMarketPriceLookup {
	dayKey: string;
	fetchedAt: number;
	pricesBySlug: Record<string, number>;
	pricesByName: Record<string, number>;
	slugByName: Record<string, string>;
	vaultedBySlug: Record<string, boolean>;
	vaultedByName: Record<string, boolean>;
}

interface ScannerEventPayload {
	source: RelicScanTriggerSource;
	triggeredAt: number;
	rewardCandidates: string[];
	logMarkers: string[];
	error?: string;
}

interface OverlaySetPiece {
	rewardName: string;
	displayName: string;
	imageUrl: string;
	ownedCount: number;
}

interface OverlayRewardValue extends RelicScanRewardValue {
	setPieces: OverlaySetPiece[];
}

interface OverlayEventPayload {
	source: RelicScanTriggerSource;
	triggeredAt: number;
	rewardCandidates: string[];
	rewards?: OverlayRewardValue[];
	error?: string;
}

interface RewardGuessDebugEntry {
	candidate: string;
	normalizedCandidate: string;
	guesses: Array<{
		rewardName: string;
		displayName: string;
		distance: number;
	}>;
}

function normalizeRewardGameRef(gameRef: string): string {
	return gameRef.replace("/StoreItems", "");
}

function estimateTopOrderPrice(orders: MarketTopOrders): number {
	const sellOrders = orders.sell ?? [];

	if (sellOrders.length === 0) {
		return 0;
	}

	const totalSell = sellOrders.reduce((sum, order) => sum + order.platinum, 0);
	return Math.round((totalSell / sellOrders.length) * 100) / 100;
}

function getUtcDayKey(dateLike: Date | number | string = Date.now()): string {
	const parsed = new Date(dateLike);
	if (Number.isNaN(parsed.getTime())) {
		return new Date().toISOString().slice(0, 10);
	}
	return parsed.toISOString().slice(0, 10);
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

function getRewardFallbackName(rewardName: string): string {
	const tail = rewardName.split("/").pop() || rewardName;
	return tail.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

function normalizeOcrText(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

	// OCR often appends the reward slot index (1-4) to the end of the line.
	return normalized.replace(/\b[1-4]$/, "").trim();
}

function getPrimeSetKey(displayName: string): string | null {
	const match = displayName.match(/^(.+?\bprime)\b/i);
	if (!match) {
		return null;
	}

	return normalizeOcrText(match[1]);
}

function levenshteinDistance(a: string, b: string): number {
	if (a === b) {
		return 0;
	}

	if (a.length === 0) {
		return b.length;
	}

	if (b.length === 0) {
		return a.length;
	}

	const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);

	for (let i = 0; i <= a.length; i += 1) {
		matrix[i][0] = i;
	}

	for (let j = 0; j <= b.length; j += 1) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			);
		}
	}

	return matrix[a.length][b.length];
}

function buildDailyMarketPriceLookup(
	items: DailyMarketPriceItem[],
	dayKey: string,
	fetchedAt: number,
): DailyMarketPriceLookup {
	const pricesBySlug: Record<string, number> = {};
	const pricesByName: Record<string, number> = {};
	const slugByName: Record<string, string> = {};
	const vaultedBySlug: Record<string, boolean> = {};
	const vaultedByName: Record<string, boolean> = {};

	for (const item of items) {
		const price = estimateTopOrderPrice(item.topOrders ?? {});
		const normalizedName = normalizeMarketName(item.itemName);
		pricesBySlug[item.slug] = price;
		pricesByName[normalizedName] = price;
		vaultedBySlug[item.slug] = item.vaulted === true;
		vaultedByName[normalizedName] = item.vaulted === true;
		if (!slugByName[normalizedName]) {
			slugByName[normalizedName] = item.slug;
		}
	}

	return {
		dayKey,
		fetchedAt,
		pricesBySlug,
		pricesByName,
		slugByName,
		vaultedBySlug,
		vaultedByName,
	};
}

function buildOwnedRelics(
	inventoryData: Record<string, unknown>,
	relicData: Record<string, VoidRelic>,
	manifest: ManifestEntry[],
	recipeDucatValues: Record<string, number>,
	rewardPlatinumValues: Record<string, number>,
	rewardPlatinumFetchedAt: Record<string, number>,
): OwnedRelic[] {
	const manifestMap = new Map<string, string>();
	for (const entry of manifest) {
		manifestMap.set(entry.uniqueName, entry.textureLocation);
	}

	const getRefinement = (
		itemType: string,
	): {
		refinement: OwnedRelic["refinement"];
		refinementLevel: OwnedRelic["refinementLevel"];
	} => {
		if (itemType.endsWith("Platinum")) {
			return { refinement: "Radiant", refinementLevel: 3 };
		}
		if (itemType.endsWith("Gold")) {
			return { refinement: "Flawless", refinementLevel: 2 };
		}
		if (itemType.endsWith("Silver")) {
			return { refinement: "Exceptional", refinementLevel: 1 };
		}
		return { refinement: "Unleveled", refinementLevel: 0 };
	};

	const miscItems =
		(inventoryData.MiscItems as InventoryMiscItem[] | undefined) || [];
	const relicCounts = new Map<string, number>();

	for (const item of miscItems) {
		if (!item.ItemType.startsWith("/Lotus/Types/Game/Projections/")) {
			continue;
		}

		const currentCount = relicCounts.get(item.ItemType) ?? 0;
		relicCounts.set(item.ItemType, currentCount + item.ItemCount);
	}

	return [...relicCounts.entries()]
		.map(([uniqueName, count]) => {
			const relic = relicData[uniqueName];
			const textureLocation = manifestMap.get(uniqueName) || "";
			const imageUrl = textureLocation
				? `http://content.warframe.com/PublicExport${textureLocation}`
				: "";
			const { refinement, refinementLevel } = getRefinement(uniqueName);
			const relicRewards = (relic?.relicRewards ?? []).map((reward) => {
				const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
				const rewardTextureLocation =
					manifestMap.get(normalizedRewardName) || "";
				const rewardImageUrl = rewardTextureLocation
					? `http://content.warframe.com/PublicExport${rewardTextureLocation}`
					: "";
				const ducats =
					recipeDucatValues[reward.rewardName] ??
					recipeDucatValues[normalizedRewardName] ??
					0;
				const platinum =
					rewardPlatinumValues[reward.rewardName] ??
					rewardPlatinumValues[normalizedRewardName] ??
					0;
				return {
					...reward,
					imageUrl: rewardImageUrl,
					ducats,
					platinum,
				};
			});
			const isPlatinumReady = relicRewards.every((reward) => {
				const normalizedRewardName = normalizeRewardGameRef(reward.rewardName);
				return (
					rewardPlatinumFetchedAt[reward.rewardName] !== undefined ||
					rewardPlatinumFetchedAt[normalizedRewardName] !== undefined
				);
			});
			const expectedDucats = calculateExpectedDucats(
				relicRewards,
				refinementLevel,
			);
			const expectedPlatinum = isPlatinumReady
				? calculateExpectedPlatinum(relicRewards, refinementLevel)
				: 0;

			return {
				uniqueName,
				name: relic?.name ?? uniqueName.split("/").pop() ?? "Unknown Relic",
				description: relic?.description ?? "",
				count,
				imageUrl,
				refinement,
				refinementLevel,
				expectedDucats,
				expectedPlatinum,
				isPlatinumReady,
				relicRewards,
			};
		})
		.sort(
			(a, b) =>
				a.name.localeCompare(b.name) || b.refinementLevel - a.refinementLevel,
		);
}

function AppMain() {
	const { inventory, error: inventoryError, refreshInventory } = useInventory();

	const {
		assets,
		manifest,
		warframeNames,
		warframeData,
		weaponNames,
		weaponData,
		companionNames,
		companionData,
		relicData,
		recipeData,
		recipeDucatValues,
		resourceNames,
		indexLoading,
		error: dataError,
	} = useData();
	const activeTab = useStore(appStore, (state) => state.activeTab);
	const visibleRewardNames = useStore(
		appStore,
		(state) => state.visibleRewardNames,
	);
	const rewardPlatinumValues = useStore(
		appStore,
		(state) => state.rewardPlatinumValues,
	);
	const rewardPlatinumFetchedAt = useStore(
		appStore,
		(state) => state.rewardPlatinumFetchedAt,
	);
	const eeLogPath = useStore(appStore, (state) => state.eeLogPath);
	const relicScannerEnabled = useStore(
		appStore,
		(state) => state.relicScannerEnabled,
	);
	const relicOverlayEnabled = useStore(
		appStore,
		(state) => state.relicOverlayEnabled,
	);
	const relicScannerHotkey = useStore(
		appStore,
		(state) => state.relicScannerHotkey,
	);
	const relicScannerStatus = useStore(
		appStore,
		(state) => state.relicScannerStatus,
	);
	const relicScans = useStore(appStore, (state) => state.relicScans);
	const rewardPlatinumValuesRef = useRef<Record<string, number>>({});
	const rewardPlatinumFetchedAtRef = useRef<Record<string, number>>({});
	const [dailyMarketPriceLookup, setDailyMarketPriceLookup] =
		useState<DailyMarketPriceLookup | null>(null);
	const [eeLogDetectLoading, setEeLogDetectLoading] = useState(false);
	const [relicImageTestPath, setRelicImageTestPath] = useState("");
	const [relicImageTestLoading, setRelicImageTestLoading] = useState(false);
	const [scannerSettingsLoaded, setScannerSettingsLoaded] = useState(false);
	const [activeSettingsSection, setActiveSettingsSection] =
		useState<SettingsSection>("relic-scanner");
	const [latestRewardGuessDebug, setLatestRewardGuessDebug] = useState<
		RewardGuessDebugEntry[]
	>([]);
	const error = inventoryError || dataError;

	const normalizedRelicScannerHotkey = useMemo(() => {
		const normalized = relicScannerHotkey.trim().toUpperCase();
		return normalized || DEFAULT_RELIC_SCANNER_HOTKEY;
	}, [relicScannerHotkey]);

	const scannerRewardLookup = useMemo(() => {
		const manifestTextureByUniqueName = new Map<string, string>();
		for (const entry of manifest) {
			manifestTextureByUniqueName.set(entry.uniqueName, entry.textureLocation);
		}

		const recipeDisplayNameByUniqueName = new Map<string, string>();
		for (const recipe of Object.values(recipeData)) {
			const normalizedRecipeName = normalizeRewardGameRef(recipe.uniqueName);
			if (recipeDisplayNameByUniqueName.has(normalizedRecipeName)) {
				continue;
			}

			const resultDisplayName =
				resourceNames[recipe.resultType] ||
				weaponNames[recipe.resultType] ||
				warframeNames[recipe.resultType] ||
				companionNames[recipe.resultType] ||
				getRewardFallbackName(recipe.resultType);

			const isBlueprint = /blueprint/i.test(normalizedRecipeName);
			recipeDisplayNameByUniqueName.set(
				normalizedRecipeName,
				isBlueprint ? `${resultDisplayName} Blueprint` : resultDisplayName,
			);
		}

		const byRewardName = new Map<
			string,
			{
				rewardName: string;
				displayName: string;
				normalizedDisplayName: string;
				setKey: string | null;
				imageUrl: string;
			}
		>();

		for (const relic of Object.values(relicData)) {
			for (const reward of relic.relicRewards ?? []) {
				const rewardName = normalizeRewardGameRef(reward.rewardName);
				if (byRewardName.has(rewardName)) {
					continue;
				}

				const displayName =
					resourceNames[rewardName] ||
					weaponNames[rewardName] ||
					warframeNames[rewardName] ||
					companionNames[rewardName] ||
					recipeDisplayNameByUniqueName.get(rewardName) ||
					getRewardFallbackName(rewardName);
				const textureLocation =
					manifestTextureByUniqueName.get(rewardName) || "";
				const imageUrl = textureLocation
					? `http://content.warframe.com/PublicExport${textureLocation}`
					: "";

				byRewardName.set(rewardName, {
					rewardName,
					displayName,
					normalizedDisplayName: normalizeOcrText(displayName),
					setKey: getPrimeSetKey(displayName),
					imageUrl,
				});
			}
		}

		return [...byRewardName.values()];
	}, [
		companionNames,
		recipeData,
		relicData,
		manifest,
		resourceNames,
		warframeNames,
		weaponNames,
	]);

	const scannerRewardByName = useMemo(() => {
		const byRewardName = new Map<
			string,
			{
				rewardName: string;
				displayName: string;
				normalizedDisplayName: string;
				setKey: string | null;
				imageUrl: string;
			}
		>();

		for (const reward of scannerRewardLookup) {
			byRewardName.set(reward.rewardName, reward);
		}

		return byRewardName;
	}, [scannerRewardLookup]);

	const scannerSetPiecesByKey = useMemo(() => {
		const byKey = new Map<
			string,
			Array<{
				rewardName: string;
				displayName: string;
				imageUrl: string;
			}>
		>();

		for (const reward of scannerRewardLookup) {
			if (!reward.setKey) {
				continue;
			}

			const current = byKey.get(reward.setKey) ?? [];
			current.push({
				rewardName: reward.rewardName,
				displayName: reward.displayName,
				imageUrl: reward.imageUrl,
			});
			byKey.set(reward.setKey, current);
		}

		for (const [key, pieces] of byKey) {
			pieces.sort((a, b) => a.displayName.localeCompare(b.displayName));
			byKey.set(key, pieces);
		}

		return byKey;
	}, [scannerRewardLookup]);

	const ownedScannerRewardCounts = useMemo(() => {
		const ownedCounts = new Map<string, number>();
		if (!inventory?.trim()) {
			return ownedCounts;
		}

		try {
			const inventoryData = JSON.parse(inventory) as Record<string, unknown>;
			const addOwnedType = (rawType: unknown, count = 1) => {
				if (typeof rawType !== "string" || !rawType.trim()) {
					return;
				}
				if (count <= 0) {
					return;
				}

				const normalized = normalizeRewardGameRef(rawType);
				const currentCount = ownedCounts.get(normalized) ?? 0;
				ownedCounts.set(normalized, currentCount + count);
			};

			const recipeEntries =
				(inventoryData.Recipes as
					| Array<{ ItemType?: string; ItemCount?: number }>
					| undefined) ?? [];
			for (const entry of recipeEntries) {
				addOwnedType(entry.ItemType, Math.max(1, entry.ItemCount ?? 1));
			}

			const miscEntries =
				(inventoryData.MiscItems as
					| Array<{ ItemType?: string; ItemCount?: number }>
					| undefined) ?? [];
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
					(inventoryData[key] as Array<{ ItemType?: string }> | undefined) ??
					[];
				for (const entry of entries) {
					addOwnedType(entry.ItemType, 1);
				}
			}
		} catch (err) {
			console.error(
				"Failed to derive scanner reward owned counts from inventory:",
				err,
			);
		}

		return ownedCounts;
	}, [inventory]);

	const buildOverlayRewards = useCallback(
		(rewards: RelicScanRewardValue[]): OverlayRewardValue[] => {
			return rewards.map((reward) => {
				const lookupReward = scannerRewardByName.get(reward.rewardName);
				const setPieces =
					lookupReward?.setKey && scannerSetPiecesByKey.has(lookupReward.setKey)
						? (scannerSetPiecesByKey.get(lookupReward.setKey) ?? []).map(
								(piece) => ({
									...piece,
									ownedCount:
										ownedScannerRewardCounts.get(piece.rewardName) ?? 0,
								}),
							)
						: [
								{
									rewardName: reward.rewardName,
									displayName: reward.displayName,
									imageUrl: lookupReward?.imageUrl ?? "",
									ownedCount:
										ownedScannerRewardCounts.get(reward.rewardName) ?? 0,
								},
							];

				return {
					...reward,
					setPieces,
				};
			});
		},
		[ownedScannerRewardCounts, scannerRewardByName, scannerSetPiecesByKey],
	);

	const scannerDisplayNameByRewardName = useMemo(() => {
		const byRewardName: Record<string, string> = {};
		for (const entry of scannerRewardLookup) {
			byRewardName[entry.rewardName] = entry.displayName;
		}
		return byRewardName;
	}, [scannerRewardLookup]);

	const dailyMarketSlugByRewardName = useMemo(() => {
		const lookup = dailyMarketPriceLookup;
		if (!lookup) {
			return {} as Record<string, string>;
		}

		const byRewardName: Record<string, string> = {};
		for (const entry of scannerRewardLookup) {
			const fallbackName = getRewardFallbackName(entry.rewardName);
			const candidateNames = new Set<string>([entry.displayName, fallbackName]);
			if (!/\bblueprint$/i.test(entry.displayName)) {
				candidateNames.add(`${entry.displayName} Blueprint`);
			}

			for (const name of candidateNames) {
				const normalizedName = normalizeMarketName(name);
				const mappedSlug = lookup.slugByName[normalizedName];
				if (mappedSlug) {
					byRewardName[entry.rewardName] = mappedSlug;
					break;
				}

				const slug = slugifyMarketName(name);
				if (lookup.pricesBySlug[slug] !== undefined) {
					byRewardName[entry.rewardName] = slug;
					break;
				}
			}
		}

		return byRewardName;
	}, [dailyMarketPriceLookup, scannerRewardLookup]);

	const getDailyMarketPriceForReward = useCallback(
		(rewardName: string): number => {
			const lookup = dailyMarketPriceLookup;
			if (!lookup) {
				return 0;
			}

			const normalizedRewardName = normalizeRewardGameRef(rewardName);
			const mappedSlug = dailyMarketSlugByRewardName[normalizedRewardName];
			if (mappedSlug) {
				return lookup.pricesBySlug[mappedSlug] ?? 0;
			}

			const displayName =
				scannerDisplayNameByRewardName[normalizedRewardName] ||
				resourceNames[normalizedRewardName] ||
				weaponNames[normalizedRewardName] ||
				warframeNames[normalizedRewardName] ||
				companionNames[normalizedRewardName] ||
				getRewardFallbackName(normalizedRewardName);

			const normalizedDisplayName = normalizeMarketName(displayName);
			const slugByName = lookup.slugByName[normalizedDisplayName];
			if (slugByName) {
				return lookup.pricesBySlug[slugByName] ?? 0;
			}

			return (
				lookup.pricesBySlug[slugifyMarketName(displayName)] ??
				lookup.pricesByName[normalizedDisplayName] ??
				0
			);
		},
		[
			companionNames,
			dailyMarketPriceLookup,
			dailyMarketSlugByRewardName,
			resourceNames,
			scannerDisplayNameByRewardName,
			warframeNames,
			weaponNames,
		],
	);

	const resolveScannerRewardValues = useCallback(
		(rewardCandidates: string[]): RelicScanRewardValue[] => {
			const values: RelicScanRewardValue[] = [];

			for (const [index, candidate] of rewardCandidates.entries()) {
				let normalizedRewardName = normalizeRewardGameRef(candidate);
				let displayName =
					scannerDisplayNameByRewardName[normalizedRewardName] || "";
				let confidence = 1;

				if (!displayName) {
					const normalizedCandidate = normalizeOcrText(candidate);
					const containsMatches = scannerRewardLookup.filter(
						(entry) =>
							normalizedCandidate.includes(entry.normalizedDisplayName) ||
							entry.normalizedDisplayName.includes(normalizedCandidate),
					);

					if (containsMatches.length > 0) {
						const bestContains = containsMatches.sort(
							(a, b) =>
								b.normalizedDisplayName.length - a.normalizedDisplayName.length,
						)[0];

						normalizedRewardName = bestContains.rewardName;
						displayName = bestContains.displayName;
						confidence = Math.max(
							0.65,
							bestContains.normalizedDisplayName.length /
								Math.max(normalizedCandidate.length, 1),
						);
					} else {
						let best: {
							rewardName: string;
							displayName: string;
							normalizedDisplayName: string;
							distance: number;
						} | null = null;

						for (const entry of scannerRewardLookup) {
							const distance = levenshteinDistance(
								normalizedCandidate,
								entry.normalizedDisplayName,
							);
							if (!best || distance < best.distance) {
								best = { ...entry, distance };
							}
						}

						if (!best) {
							continue;
						}

						const threshold = Math.max(
							3,
							Math.floor(best.normalizedDisplayName.length / 3),
						);

						if (best.distance > threshold) {
							continue;
						}

						normalizedRewardName = best.rewardName;
						displayName = best.displayName;
						confidence =
							1 -
							best.distance /
								Math.max(
									best.normalizedDisplayName.length,
									normalizedCandidate.length,
									1,
								);
					}
				}

				const resolvedDisplayName =
					displayName || getRewardFallbackName(normalizedRewardName);
				const platinum = getDailyMarketPriceForReward(normalizedRewardName);
				const ducats =
					recipeDucatValues[normalizedRewardName] ??
					recipeDucatValues[candidate] ??
					0;

				values.push({
					rewardName: normalizedRewardName,
					displayName: resolvedDisplayName,
					position:
						index >= 0 && index < 4
							? ((index + 1) as 1 | 2 | 3 | 4)
							: undefined,
					platinum,
					ducats,
					confidence,
					priceSource: platinum > 0 ? "daily-snapshot" : "none",
					ducatSource: ducats > 0 ? "recipe" : "none",
				});
			}

			return values;
		},
		[
			getDailyMarketPriceForReward,
			recipeDucatValues,
			scannerDisplayNameByRewardName,
			scannerRewardLookup,
		],
	);

	const buildRewardGuessDebug = useCallback(
		(rewardCandidates: string[]): RewardGuessDebugEntry[] => {
			return rewardCandidates.map((candidate) => {
				const normalizedCandidate = normalizeOcrText(candidate);
				const guesses = scannerRewardLookup
					.map((entry) => ({
						rewardName: entry.rewardName,
						displayName: entry.displayName,
						distance: levenshteinDistance(
							normalizedCandidate,
							entry.normalizedDisplayName,
						),
					}))
					.sort((a, b) => a.distance - b.distance)
					.slice(0, 3);

				return {
					candidate,
					normalizedCandidate,
					guesses,
				};
			});
		},
		[scannerRewardLookup],
	);

	const appendScanEntry = useCallback(
		(payload: ScannerEventPayload) => {
			const rawCandidates = payload.rewardCandidates ?? [];
			const rewards = resolveScannerRewardValues(rawCandidates);
			const overlayRewards = buildOverlayRewards(rewards);
			setLatestRewardGuessDebug(buildRewardGuessDebug(rawCandidates));
			const status: RelicScanStatus = payload.error
				? "error"
				: rewards.length > 0
					? "resolved"
					: "no-data";

			const entry: RelicScanEntry = {
				id: `${payload.triggeredAt}-${Math.random().toString(16).slice(2)}`,
				triggeredAt: payload.triggeredAt,
				source: payload.source,
				status,
				rewards,
				rawCandidates: rawCandidates,
				error: payload.error,
			};

			setAppRelicScans((previous) => [entry, ...previous].slice(0, 100));
			const overlayPayload: OverlayEventPayload = {
				source: entry.source,
				triggeredAt: entry.triggeredAt,
				rewardCandidates: entry.rawCandidates,
				rewards: overlayRewards,
				error: entry.error,
			};

			void emitTo("relic-overlay", "relic-scan-overlay", overlayPayload);
			void emit("relic-scan-overlay", overlayPayload);
		},
		[buildOverlayRewards, buildRewardGuessDebug, resolveScannerRewardValues],
	);

	const persistEeLogPath = useCallback((value: string) => {
		setAppEeLogPath(value);
		try {
			if (value.trim()) {
				localStorage.setItem(EE_LOG_PATH_CACHE_KEY, value);
			} else {
				localStorage.removeItem(EE_LOG_PATH_CACHE_KEY);
			}
		} catch (err) {
			console.error("Failed to persist EE.log path:", err);
		}
	}, []);

	const detectEeLogPath = useCallback(
		async (applyDetected = true) => {
			setEeLogDetectLoading(true);
			try {
				const detectedPath = await invoke<string | null>("detect_ee_log_path");
				if (!detectedPath) {
					return null;
				}
				if (applyDetected) {
					persistEeLogPath(detectedPath);
				}
				return detectedPath;
			} catch (err) {
				console.error("Failed to detect EE.log path:", err);
				return null;
			} finally {
				setEeLogDetectLoading(false);
			}
		},
		[persistEeLogPath],
	);

	useEffect(() => {
		rewardPlatinumValuesRef.current = rewardPlatinumValues;
	}, [rewardPlatinumValues]);

	useEffect(() => {
		rewardPlatinumFetchedAtRef.current = rewardPlatinumFetchedAt;
	}, [rewardPlatinumFetchedAt]);

	useEffect(() => {
		let hasSavedPath = false;
		try {
			const rawScannerSettings = localStorage.getItem(
				RELIC_SCANNER_SETTINGS_CACHE_KEY,
			);
			if (rawScannerSettings) {
				const parsed = JSON.parse(rawScannerSettings) as {
					relicScannerEnabled?: boolean;
					relicOverlayEnabled?: boolean;
					relicScannerHotkey?: string;
				};
				if (typeof parsed.relicScannerEnabled === "boolean") {
					setAppRelicScannerEnabled(parsed.relicScannerEnabled);
				}
				if (typeof parsed.relicOverlayEnabled === "boolean") {
					setAppRelicOverlayEnabled(parsed.relicOverlayEnabled);
				}
				if (typeof parsed.relicScannerHotkey === "string") {
					const parsedHotkey = parsed.relicScannerHotkey.trim().toUpperCase();
					// Migrate historical default from F12 to F11 for existing cached settings.
					const migratedHotkey =
						parsedHotkey === LEGACY_RELIC_SCANNER_HOTKEY
							? DEFAULT_RELIC_SCANNER_HOTKEY
							: parsedHotkey || DEFAULT_RELIC_SCANNER_HOTKEY;
					setAppRelicScannerHotkey(migratedHotkey);
				}
			}
		} catch (err) {
			console.error("Failed to read scanner settings cache:", err);
		}

		try {
			const cachedPath = localStorage.getItem(EE_LOG_PATH_CACHE_KEY);
			if (cachedPath?.trim()) {
				hasSavedPath = true;
				setAppEeLogPath(cachedPath);
			}
		} catch (err) {
			console.error("Failed to read cached EE.log path:", err);
		}

		detectEeLogPath(!hasSavedPath);
		setScannerSettingsLoaded(true);
	}, [detectEeLogPath]);

	useEffect(() => {
		if (!scannerSettingsLoaded) {
			return;
		}

		try {
			localStorage.setItem(
				RELIC_SCANNER_SETTINGS_CACHE_KEY,
				JSON.stringify({
					relicScannerEnabled,
					relicOverlayEnabled,
					relicScannerHotkey: normalizedRelicScannerHotkey,
				}),
			);
		} catch (err) {
			console.error("Failed to persist scanner settings cache:", err);
		}
	}, [
		relicOverlayEnabled,
		relicScannerEnabled,
		normalizedRelicScannerHotkey,
		scannerSettingsLoaded,
	]);

	useEffect(() => {
		if (!scannerSettingsLoaded) {
			return;
		}

		void invoke("set_relic_overlay_enabled", {
			enabled: relicOverlayEnabled,
		}).catch((err) => {
			console.error("Failed to apply relic overlay setting on startup:", err);
		});
	}, [relicOverlayEnabled, scannerSettingsLoaded]);

	const handleRelicOverlayEnabledChange = useCallback(
		async (nextEnabled: boolean) => {
			if (nextEnabled === relicOverlayEnabled) {
				return;
			}

			const confirmed = window.confirm(
				"Changing the relic overlay setting requires restarting YumeFrame. Restart now?",
			);
			if (!confirmed) {
				return;
			}

			try {
				localStorage.setItem(
					RELIC_SCANNER_SETTINGS_CACHE_KEY,
					JSON.stringify({
						relicScannerEnabled,
						relicOverlayEnabled: nextEnabled,
						relicScannerHotkey: normalizedRelicScannerHotkey,
					}),
				);
			} catch (err) {
				console.error(
					"Failed to persist scanner settings before restart:",
					err,
				);
			}

			setAppRelicOverlayEnabled(nextEnabled);
			try {
				await invoke("restart_app");
			} catch (err) {
				console.error(
					"Failed to restart app after overlay setting change:",
					err,
				);
			}
		},
		[normalizedRelicScannerHotkey, relicOverlayEnabled, relicScannerEnabled],
	);

	useEffect(() => {
		let mounted = true;
		const unlistenPromise = listen<ScannerEventPayload>(
			"relic-scan-triggered",
			(event) => {
				if (!mounted) {
					return;
				}
				appendScanEntry(event.payload);
			},
		);

		return () => {
			mounted = false;
			void unlistenPromise.then((unlisten) => {
				unlisten();
			});
		};
	}, [appendScanEntry]);

	useEffect(() => {
		let mounted = true;
		const unlistenPromise = listen<string>("relic-scanner-error", (event) => {
			if (!mounted) {
				return;
			}

			setAppRelicScannerStatus("error");
			console.error(event.payload);
		});

		return () => {
			mounted = false;
			void unlistenPromise.then((unlisten) => {
				unlisten();
			});
		};
	}, []);

	useEffect(() => {
		let isCancelled = false;

		async function setupScanner() {
			try {
				if (!relicScannerEnabled || !eeLogPath.trim()) {
					setAppRelicScannerStatus("stopped");
					await invoke("stop_relic_scanner");
					return;
				}

				await invoke("start_relic_scanner", {
					eeLogPath,
					hotkey: normalizedRelicScannerHotkey,
				});
				if (!isCancelled) {
					setAppRelicScannerStatus("watching");
				}
			} catch (err) {
				console.error("Failed to initialize relic scanner:", err);
				if (!isCancelled) {
					setAppRelicScannerStatus("error");
				}
			}
		}

		setupScanner();

		return () => {
			isCancelled = true;
			void invoke("stop_relic_scanner");
		};
	}, [eeLogPath, normalizedRelicScannerHotkey, relicScannerEnabled]);

	const runManualRelicScan = useCallback(async () => {
		await invoke("trigger_relic_scan", { source: "manual" });
	}, []);

	const runRelicImageTest = useCallback(async () => {
		if (!relicImageTestPath.trim()) {
			return;
		}

		setRelicImageTestLoading(true);
		try {
			try {
				await invoke("set_relic_overlay_enabled", { enabled: true });
			} catch (err) {
				console.error("Failed to show overlay before image test:", err);
			}

			await invoke("trigger_relic_scan_from_image", {
				imagePath: relicImageTestPath,
				source: "image-test",
			});
		} finally {
			setRelicImageTestLoading(false);
		}
	}, [relicImageTestPath]);

	useEffect(() => {
		try {
			const cachedPath = localStorage.getItem(RELIC_IMAGE_TEST_PATH_CACHE_KEY);
			if (cachedPath) {
				setRelicImageTestPath(cachedPath);
			}
		} catch (err) {
			console.error("Failed to read relic image test path cache:", err);
		}
	}, []);

	useEffect(() => {
		try {
			if (relicImageTestPath.trim()) {
				localStorage.setItem(
					RELIC_IMAGE_TEST_PATH_CACHE_KEY,
					relicImageTestPath,
				);
			} else {
				localStorage.removeItem(RELIC_IMAGE_TEST_PATH_CACHE_KEY);
			}
		} catch (err) {
			console.error("Failed to persist relic image test path cache:", err);
		}
	}, [relicImageTestPath]);

	useEffect(() => {
		try {
			const rawCache = localStorage.getItem(RELIC_PRICE_CACHE_KEY);
			if (!rawCache) {
				return;
			}

			const parsed = JSON.parse(rawCache) as {
				values?: Record<string, number>;
				fetchedAt?: Record<string, number>;
			};

			const todayKey = getUtcDayKey();
			const validFetchedAt: Record<string, number> = {};
			const validValues: Record<string, number> = {};

			for (const [rewardName, fetchedAt] of Object.entries(
				parsed.fetchedAt ?? {},
			)) {
				if (getUtcDayKey(fetchedAt) === todayKey) {
					validFetchedAt[rewardName] = fetchedAt;
					if (parsed.values?.[rewardName] !== undefined) {
						validValues[rewardName] = parsed.values[rewardName];
					}
				}
			}

			rewardPlatinumFetchedAtRef.current = validFetchedAt;
			rewardPlatinumValuesRef.current = validValues;
			setAppRewardPlatinumFetchedAt(validFetchedAt);
			setAppRewardPlatinumValues(validValues);
		} catch (err) {
			console.error("Failed to read relic price cache:", err);
		}
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem(
				RELIC_PRICE_CACHE_KEY,
				JSON.stringify({
					values: rewardPlatinumValues,
					fetchedAt: rewardPlatinumFetchedAt,
				}),
			);
		} catch (err) {
			console.error("Failed to persist relic price cache:", err);
		}
	}, [rewardPlatinumFetchedAt, rewardPlatinumValues]);

	useEffect(() => {
		let isCancelled = false;

		async function loadDailyMarketSnapshot() {
			const todayKey = getUtcDayKey();

			try {
				const rawCachedLookup = localStorage.getItem(
					RELIC_DAILY_MARKET_CACHE_KEY,
				);
				if (rawCachedLookup) {
					const cachedLookup = JSON.parse(
						rawCachedLookup,
					) as DailyMarketPriceLookup;
					if (
						cachedLookup.dayKey === todayKey &&
						cachedLookup.pricesBySlug &&
						cachedLookup.pricesByName &&
						cachedLookup.slugByName &&
						cachedLookup.vaultedBySlug &&
						cachedLookup.vaultedByName
					) {
						if (!isCancelled) {
							setDailyMarketPriceLookup(cachedLookup);
						}
						return;
					}
				}
			} catch (err) {
				console.error("Failed to read cached daily market prices:", err);
			}

			try {
				const response = await tauriFetch(WFM_DAILY_MARKET_PRICES_URL);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				const payload = (await response.json()) as DailyMarketPricePayload;
				const fetchedAt = Date.now();
				const lookup = buildDailyMarketPriceLookup(
					payload.items ?? [],
					todayKey,
					fetchedAt,
				);

				try {
					localStorage.setItem(
						RELIC_DAILY_MARKET_CACHE_KEY,
						JSON.stringify(lookup),
					);
				} catch (err) {
					console.error("Failed to cache daily market prices:", err);
				}

				if (!isCancelled) {
					setDailyMarketPriceLookup(lookup);
				}
			} catch (err) {
				console.error("Failed to fetch daily market prices:", err);
			}
		}

		loadDailyMarketSnapshot();

		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!inventory) {
			setAppRelics([]);
			return;
		}

		try {
			const inventoryData = JSON.parse(inventory) as Record<string, unknown>;
			setAppRelics(
				buildOwnedRelics(
					inventoryData,
					relicData,
					manifest,
					recipeDucatValues,
					rewardPlatinumValues,
					rewardPlatinumFetchedAt,
				),
			);
		} catch (err) {
			console.error("Failed to parse relic inventory:", err);
			setAppRelics([]);
		}
	}, [
		inventory,
		relicData,
		manifest,
		recipeDucatValues,
		rewardPlatinumValues,
		rewardPlatinumFetchedAt,
	]);

	useEffect(() => {
		if (visibleRewardNames.length === 0) {
			return;
		}

		const marketLookup = dailyMarketPriceLookup;
		if (!marketLookup) {
			return;
		}

		const nextValues = { ...rewardPlatinumValuesRef.current };
		const nextFetchedAt = { ...rewardPlatinumFetchedAtRef.current };
		let hasChanges = false;

		for (const rewardName of visibleRewardNames) {
			const normalizedRewardName = normalizeRewardGameRef(rewardName);
			const directPrice = getDailyMarketPriceForReward(normalizedRewardName);

			if (nextValues[normalizedRewardName] !== directPrice) {
				nextValues[normalizedRewardName] = directPrice;
				hasChanges = true;
			}

			if (nextFetchedAt[normalizedRewardName] !== marketLookup.fetchedAt) {
				nextFetchedAt[normalizedRewardName] = marketLookup.fetchedAt;
				hasChanges = true;
			}
		}

		if (!hasChanges) {
			return;
		}

		rewardPlatinumValuesRef.current = nextValues;
		rewardPlatinumFetchedAtRef.current = nextFetchedAt;
		setAppRewardPlatinumValues(nextValues);
		setAppRewardPlatinumFetchedAt(nextFetchedAt);
	}, [
		visibleRewardNames,
		dailyMarketPriceLookup,
		getDailyMarketPriceForReward,
	]);

	// if the daily snapshot arrives after we've already recorded scans, re-
	// resolve their prices and emit updated overlay events so the window can
	// refresh existing entries (users frequently trigger a scan before the
	// snapshot has finished loading). we only bother if something actually
	// changed.
	useEffect(() => {
		if (!dailyMarketPriceLookup) {
			return;
		}

		setAppRelicScans((previous) => {
			let changed = false;
			const updated = previous.map((entry) => {
				const newRewards = resolveScannerRewardValues(entry.rawCandidates);
				const overlayRewards = buildOverlayRewards(newRewards);
				if (
					newRewards.length !== entry.rewards.length ||
					newRewards.some((r, i) => r.platinum !== entry.rewards[i]?.platinum)
				) {
					changed = true;
					void emit("relic-scan-overlay", {
						source: entry.source,
						triggeredAt: entry.triggeredAt,
						rewardCandidates: entry.rawCandidates,
						rewards: overlayRewards,
						error: entry.error,
					});
					return { ...entry, rewards: newRewards };
				}
				return entry;
			});
			return changed ? updated : previous;
		});
	}, [buildOverlayRewards, dailyMarketPriceLookup, resolveScannerRewardValues]);

	const applyInventoryData = useCallback(
		(result: string) => {
			const inventoryData = JSON.parse(result);
			const suits: WarframeSuit[] = inventoryData.Suits || [];
			const spaceSuits: WarframeSuit[] = inventoryData.SpaceSuits || [];
			interface ConsumedSuitEntry {
				s?: string;
				S?: string;
				ItemType?: string;
				itemType?: string;
			}
			const normalizeTypePath = (value: string): string => {
				const trimmed = value.trim();
				if (trimmed.length === 0) {
					return "";
				}
				return trimmed.toLowerCase().replace(/\\/g, "/");
			};
			const consumedSuits: ConsumedSuitEntry[] =
				inventoryData.InfestedFoundry?.ConsumedSuits || [];
			const consumedSuitTypes = new Set(
				consumedSuits
					.map((entry) =>
						normalizeTypePath(
							entry.s ?? entry.S ?? entry.ItemType ?? entry.itemType ?? "",
						),
					)
					.filter((value): value is string => value.length > 0),
			);

			interface XPInfoEntry {
				ItemType: string;
				XP: number;
			}
			const xpInfo: XPInfoEntry[] = inventoryData.XPInfo || [];
			const xpByItemType = new Map<string, number>();
			for (const entry of xpInfo) {
				xpByItemType.set(entry.ItemType, entry.XP || 0);
			}
			const weaponInventoryKeys = [
				"Pistols",
				"LongGuns",
				"Melee",
				"SpaceGuns",
				"SpaceMelee",
				"SentinelWeapons",
				"OperatorAmps",
			] as const;
			const ownedWeaponDetails = new Map<string, InventoryWeaponEntry>();
			for (const key of weaponInventoryKeys) {
				const entries: InventoryWeaponEntry[] = inventoryData[key] || [];
				for (const entry of entries) {
					ownedWeaponDetails.set(entry.ItemType, entry);
				}
			}

			const companionInventoryKeys = [
				"Sentinels",
				"KubrowPets",
				"MoaPets",
				"InfestedPets",
			] as const;
			const ownedCompanionDetails = new Map<string, InventoryCompanionEntry>();
			for (const key of companionInventoryKeys) {
				const entries: InventoryCompanionEntry[] = inventoryData[key] || [];
				for (const entry of entries) {
					ownedCompanionDetails.set(entry.ItemType, entry);
				}
			}

			const allSuits = [...suits, ...spaceSuits];
			const ownedTypes = new Set(allSuits.map((suit) => suit.ItemType));

			const ownedDetails = new Map<string, WarframeSuit>();
			for (const suit of allSuits) {
				ownedDetails.set(suit.ItemType, suit);
			}

			for (const itemType of ownedCompanionDetails.keys()) {
				ownedTypes.add(itemType);
			}

			interface RecipeItem {
				ItemType: string;
				ItemCount: number;
			}
			const playerRecipes: RecipeItem[] = inventoryData.Recipes || [];
			const ownedBlueprints = new Set(playerRecipes.map((r) => r.ItemType));
			const miscItems: InventoryMiscItem[] = inventoryData.MiscItems || [];
			const ownedMiscCounts = new Map<string, number>();
			for (const miscItem of miscItems) {
				const currentCount = ownedMiscCounts.get(miscItem.ItemType) ?? 0;
				ownedMiscCounts.set(
					miscItem.ItemType,
					currentCount + miscItem.ItemCount,
				);
			}

			const manifestMap = new Map<string, string>();
			for (const entry of manifest) {
				manifestMap.set(entry.uniqueName, entry.textureLocation);
			}

			const recipeByUniqueName = new Map<string, { resultType: string }>();
			for (const recipe of Object.values(recipeData)) {
				recipeByUniqueName.set(recipe.uniqueName, {
					resultType: recipe.resultType,
				});
			}

			const pendingRecipeEntries: InventoryPendingRecipeEntry[] =
				inventoryData.PendingRecipes || [];
			const pendingRecipes: PendingRecipe[] = pendingRecipeEntries
				.map((entry) => {
					const completionLong = entry.CompletionDate?.$date?.$numberLong;
					const completionTimestamp =
						typeof completionLong === "string" ? Number(completionLong) : NaN;

					if (!entry.ItemType || !Number.isFinite(completionTimestamp)) {
						return null;
					}

					const recipe = recipeByUniqueName.get(entry.ItemType);
					const resultType = recipe?.resultType ?? entry.ItemType;
					const fallbackName = resultType.split("/").pop() || "Recipe";
					const displayName =
						weaponNames[resultType] ||
						warframeNames[resultType] ||
						companionNames[resultType] ||
						resourceNames[resultType] ||
						fallbackName;
					const textureLocation = manifestMap.get(resultType) || "";
					const imageUrl = textureLocation
						? `http://content.warframe.com/PublicExport${textureLocation}`
						: "";

					return {
						itemType: entry.ItemType,
						resultType,
						name: displayName,
						imageUrl,
						completionTimestamp,
					};
				})
				.filter((entry): entry is PendingRecipe => entry !== null)
				.sort((a, b) => a.completionTimestamp - b.completionTimestamp);
			setAppPendingRecipes(pendingRecipes);
			const pendingRecipeTypes = new Set(
				pendingRecipes.map((recipe) => recipe.itemType),
			);

			const wfList: Warframe[] = Object.entries(warframeData).map(
				([uniqueName, warframeInfo]) => {
					const displayName = warframeInfo.name;
					const textureLocation = manifestMap.get(uniqueName) || "";
					const imageUrl = textureLocation
						? `http://content.warframe.com/PublicExport${textureLocation}`
						: "";

					const isOwned = ownedTypes.has(uniqueName);
					const ownedData = ownedDetails.get(uniqueName);

					const nameParts = uniqueName.split("/");
					const name = nameParts[nameParts.length - 1] || "Unknown";

					let parts: WarframePart[] = [];

					const mainRecipe = recipeData[uniqueName];
					const hasMainBlueprint = mainRecipe
						? ownedBlueprints.has(mainRecipe.uniqueName)
						: false;

					const mainBlueprintTexture = mainRecipe
						? manifestMap.get(mainRecipe.uniqueName) || ""
						: "";
					const mainBlueprintIcon = mainBlueprintTexture
						? `http://content.warframe.com/PublicExport${mainBlueprintTexture}`
						: "";

					parts = [
						{
							name: "Blueprint",
							itemType: mainRecipe?.uniqueName,
							owned: hasMainBlueprint,
							hasRecipe: hasMainBlueprint,
							isCraftingRecipe: mainRecipe
								? pendingRecipeTypes.has(mainRecipe.uniqueName)
								: false,
							imageUrl: mainBlueprintIcon,
						},
					];

					if (mainRecipe) {
						for (const ingredient of mainRecipe.ingredients) {
							const itemType = ingredient.ItemType;
							const ingredientRecipeType = itemType.replace(
								"Component",
								"Blueprint",
							);
							const hasRecipe = ownedBlueprints.has(ingredientRecipeType);
							const isCraftingRecipe =
								pendingRecipeTypes.has(ingredientRecipeType);
							const ownedMaterialCount = ownedMiscCounts.get(itemType) ?? 0;
							const hasEnoughMaterials =
								ownedMaterialCount >= ingredient.ItemCount;
							const partName =
								weaponNames[itemType] ||
								warframeNames[itemType] ||
								companionNames[itemType] ||
								resourceNames[itemType] ||
								itemType.split("/").pop() ||
								"Part";
							const partTexture = manifestMap.get(itemType) || "";
							const partIcon = partTexture
								? `http://content.warframe.com/PublicExport${partTexture}`
								: "";

							parts.push({
								name: partName,
								itemType,
								count: ingredient.ItemCount,
								owned: hasRecipe || hasEnoughMaterials,
								hasRecipe,
								isCraftingRecipe,
								imageUrl: partIcon,
							});
						}
					}

					return {
						name,
						displayName,
						type: uniqueName,
						xp: xpByItemType.get(uniqueName) ?? ownedData?.XP ?? 0,
						maxLevel: warframeInfo.productCategory === "MechSuits" ? 40 : 30,
						imageUrl,
						favorite: ownedData?.Favorite || false,
						owned: isOwned,
						isSubsumed: consumedSuitTypes.has(normalizeTypePath(uniqueName)),
						parts,
					};
				},
			);

			wfList.sort((a, b) => a.displayName.localeCompare(b.displayName));
			setAppWarframes(wfList);

			const allWeapons: OwnedWeapon[] = Object.entries(weaponData).map(
				([uniqueName, weaponInfo]) => {
					const ownedWeaponData = ownedWeaponDetails.get(uniqueName);
					const weaponTextureLocation = manifestMap.get(uniqueName) || "";
					const weaponImageUrl = weaponTextureLocation
						? `http://content.warframe.com/PublicExport${weaponTextureLocation}`
						: "";

					const weaponRecipe = recipeData[uniqueName];
					const requirements =
						weaponRecipe?.ingredients.map((ingredient) => {
							const itemType = ingredient.ItemType;
							const hasRecipe = ownedBlueprints.has(itemType);
							const ownedMaterialCount = ownedMiscCounts.get(itemType) ?? 0;
							const hasEnoughMaterials =
								ownedMaterialCount >= ingredient.ItemCount;
							const requirementName =
								weaponNames[itemType] ||
								warframeNames[itemType] ||
								companionNames[itemType] ||
								resourceNames[itemType] ||
								itemType.split("/").pop() ||
								"Unknown";

							const requirementTextureLocation =
								manifestMap.get(itemType) || "";
							const requirementImageUrl = requirementTextureLocation
								? `http://content.warframe.com/PublicExport${requirementTextureLocation}`
								: "";

							return {
								name: requirementName,
								itemType,
								count: ingredient.ItemCount,
								imageUrl: requirementImageUrl,
								owned: hasRecipe || hasEnoughMaterials,
								hasRecipe,
								isCraftingRecipe: pendingRecipeTypes.has(itemType),
							};
						}) || [];

					return {
						...weaponInfo,
						displayName: weaponInfo.name,
						type: uniqueName,
						xp: xpByItemType.get(uniqueName) ?? ownedWeaponData?.XP ?? 0,
						favorite: ownedWeaponData?.Favorite || false,
						owned: ownedWeaponDetails.has(uniqueName),
						imageUrl: weaponImageUrl,
						requirements,
					};
				},
			);

			allWeapons.sort((a, b) => a.displayName.localeCompare(b.displayName));
			setAppWeapons(allWeapons);

			const allCompanions: OwnedCompanion[] = Object.entries(companionData)
				.filter(([, companionInfo]) => companionInfo.excludeFromCodex !== true)
				.map(([uniqueName, companionInfo]) => {
					const ownedCompanionData = ownedCompanionDetails.get(uniqueName);
					const companionTextureLocation = manifestMap.get(uniqueName) || "";
					const companionImageUrl = companionTextureLocation
						? `http://content.warframe.com/PublicExport${companionTextureLocation}`
						: "";

					const companionRecipe = recipeData[uniqueName];
					const requirements =
						companionRecipe?.ingredients.map((ingredient) => {
							const itemType = ingredient.ItemType;
							const hasRecipe = ownedBlueprints.has(itemType);
							const ownedMaterialCount = ownedMiscCounts.get(itemType) ?? 0;
							const hasEnoughMaterials =
								ownedMaterialCount >= ingredient.ItemCount;
							const requirementName =
								weaponNames[itemType] ||
								warframeNames[itemType] ||
								companionNames[itemType] ||
								resourceNames[itemType] ||
								itemType.split("/").pop() ||
								"Unknown";

							const requirementTextureLocation =
								manifestMap.get(itemType) || "";
							const requirementImageUrl = requirementTextureLocation
								? `http://content.warframe.com/PublicExport${requirementTextureLocation}`
								: "";

							return {
								name: requirementName,
								itemType,
								count: ingredient.ItemCount,
								imageUrl: requirementImageUrl,
								owned: hasRecipe || hasEnoughMaterials,
								hasRecipe,
								isCraftingRecipe: pendingRecipeTypes.has(itemType),
							};
						}) || [];

					const customName = ownedCompanionData?.Details?.Name;

					return {
						...companionInfo,
						displayName: customName || companionInfo.name,
						type: uniqueName,
						xp: xpByItemType.get(uniqueName) ?? ownedCompanionData?.XP ?? 0,
						favorite: ownedCompanionData?.Favorite || false,
						owned: ownedCompanionDetails.has(uniqueName),
						imageUrl: companionImageUrl,
						customName,
						requirements,
					};
				});

			allCompanions.sort((a, b) => a.displayName.localeCompare(b.displayName));
			setAppCompanions(allCompanions);

			console.log(
				`Loaded ${wfList.length} warframes/archwings (${suits.length} warframes + ${spaceSuits.length} archwings owned)`,
			);
			console.log(
				`Loaded ${allWeapons.length} weapons (${ownedWeaponDetails.size} owned in inventory categories)`,
			);
			console.log(
				`Loaded ${allCompanions.length} companions (${ownedCompanionDetails.size} owned from Sentinels/KubrowPets)`,
			);
		},
		[
			warframeData,
			weaponData,
			companionData,
			recipeData,
			weaponNames,
			warframeNames,
			companionNames,
			resourceNames,
			manifest,
		],
	);

	useEffect(() => {
		if (!inventory) {
			setAppWarframes([]);
			setAppWeapons([]);
			setAppCompanions([]);
			setAppPendingRecipes([]);
			return;
		}

		if (
			Object.keys(warframeData).length === 0 &&
			Object.keys(weaponData).length === 0 &&
			Object.keys(companionData).length === 0
		) {
			return;
		}

		try {
			applyInventoryData(inventory);
		} catch (err) {
			console.error("Failed to apply inventory data:", err);
		}
	}, [inventory, warframeData, weaponData, companionData, applyInventoryData]);

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			{activeTab === "settings" ? (
				<SettingsSidebar
					activeSection={activeSettingsSection}
					onSectionChange={setActiveSettingsSection}
					onExitSettings={() => setAppActiveTab("foundry")}
				/>
			) : (
				<Sidebar activeTab={activeTab} onTabChange={setAppActiveTab} />
			)}
			<main className="flex-1 min-w-0 min-h-0 p-2 pb-0">
				{activeTab === "foundry" ? (
					<FoundryPage error={error} onRefresh={refreshInventory} />
				) : activeTab === "mastery-helper" ? (
					<div className="h-full">
						<MasteryHelperPage />
					</div>
				) : activeTab === "relic-planner" ? (
					<div className="h-full">
						<RelicPlannerPage />
					</div>
				) : activeTab === "relic-scanner" ? (
					<div className="h-full">
						<RelicScannerPage
							scannerStatus={relicScannerStatus}
							scannerEnabled={relicScannerEnabled}
							scans={relicScans}
						/>
					</div>
				) : (
					<ScrollArea className="h-full min-w-0">
						<div className="h-full min-w-0">
							<SettingsPage
								activeSection={activeSettingsSection}
								indexLoading={indexLoading}
								error={error}
								assets={assets}
								inventory={inventory}
								eeLogPath={eeLogPath}
								onEeLogPathChange={persistEeLogPath}
								onDetectEeLogPath={detectEeLogPath}
								eeLogDetectLoading={eeLogDetectLoading}
								relicScannerEnabled={relicScannerEnabled}
								onRelicScannerEnabledChange={setAppRelicScannerEnabled}
								relicOverlayEnabled={relicOverlayEnabled}
								onRelicOverlayEnabledChange={handleRelicOverlayEnabledChange}
								relicScannerHotkey={relicScannerHotkey}
								onRelicScannerHotkeyChange={setAppRelicScannerHotkey}
								onManualRelicScan={runManualRelicScan}
								relicTestImagePath={relicImageTestPath}
								onRelicTestImagePathChange={setRelicImageTestPath}
								onRunRelicImageTest={runRelicImageTest}
								relicImageTestLoading={relicImageTestLoading}
								latestRewardGuessDebug={latestRewardGuessDebug}
							/>
						</div>
					</ScrollArea>
				)}
			</main>
		</div>
	);
}

function App() {
	return <AppMain />;
}

export default App;
