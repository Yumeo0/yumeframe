import { useStore } from "@tanstack/react-store";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useCallback, useEffect, useRef, useState } from "react";
import { FoundryPage } from "@/components/app/FoundryPage";
import { MasteryHelperPage } from "@/components/app/MasteryHelperPage";
import { RelicPlannerPage } from "@/components/app/RelicPlannerPage";
import { SettingsPage } from "@/components/app/SettingsPage";
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
	setAppRelics,
	setAppRewardPlatinumFetchedAt,
	setAppRewardPlatinumValues,
	setAppWarframes,
	setAppWeapons,
} from "@/store/appStore";
import type {
	InventoryCompanionEntry,
	InventoryMiscItem,
	InventoryWeaponEntry,
	ManifestEntry,
	OwnedCompanion,
	OwnedRelic,
	OwnedWeapon,
	VoidRelic,
	Warframe,
	WarframePart,
	WarframeSuit,
} from "@/types";

const RELIC_PRICE_CACHE_KEY = "yumeframe.relic.price.cache";
const RELIC_DAILY_MARKET_CACHE_KEY = "yumeframe.relic.daily.market.cache";
const EE_LOG_PATH_CACHE_KEY = "yumeframe.ee-log.path";
const WFM_DAILY_MARKET_PRICES_URL =
	"https://raw.githubusercontent.com/Yumeo0/wfmarket-prices/refs/heads/main/data/warframe-market-prices.json";

interface MarketTopOrders {
	buy?: Array<{ platinum: number }>;
	sell?: Array<{ platinum: number }>;
}

interface DailyMarketPriceItem {
	slug: string;
	itemName: string;
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
}

function normalizeRewardGameRef(gameRef: string): string {
	return gameRef.replace("/StoreItems", "");
}

function estimateTopOrderPrice(orders: MarketTopOrders): number {
	const buyOrders = orders.buy ?? [];
	const sellOrders = orders.sell ?? [];

	const bestBuy = buyOrders.length > 0 ? buyOrders[0].platinum : null;
	const bestSell = sellOrders.length > 0 ? sellOrders[0].platinum : null;

	if (bestBuy !== null && bestSell !== null) {
		return Math.round(((bestBuy + bestSell) / 2) * 100) / 100;
	}

	if (bestSell !== null) {
		return bestSell;
	}

	if (bestBuy !== null) {
		return bestBuy;
	}

	return 0;
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

function buildDailyMarketPriceLookup(
	items: DailyMarketPriceItem[],
	dayKey: string,
	fetchedAt: number,
): DailyMarketPriceLookup {
	const pricesBySlug: Record<string, number> = {};
	const pricesByName: Record<string, number> = {};

	for (const item of items) {
		const price = estimateTopOrderPrice(item.topOrders ?? {});
		pricesBySlug[item.slug] = price;
		pricesByName[normalizeMarketName(item.itemName)] = price;
	}

	return {
		dayKey,
		fetchedAt,
		pricesBySlug,
		pricesByName,
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

function App() {
	const {
		inventory,
		error: inventoryError,
		refreshInventory,
	} = useInventory();
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
	const rewardPlatinumValuesRef = useRef<Record<string, number>>({});
	const rewardPlatinumFetchedAtRef = useRef<Record<string, number>>({});
	const [dailyMarketPriceLookup, setDailyMarketPriceLookup] =
		useState<DailyMarketPriceLookup | null>(null);
	const [eeLogDetectLoading, setEeLogDetectLoading] = useState(false);
	const error = inventoryError || dataError;

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

	const detectEeLogPath = useCallback(async (applyDetected = true) => {
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
	}, [persistEeLogPath]);

	useEffect(() => {
		rewardPlatinumValuesRef.current = rewardPlatinumValues;
	}, [rewardPlatinumValues]);

	useEffect(() => {
		rewardPlatinumFetchedAtRef.current = rewardPlatinumFetchedAt;
	}, [rewardPlatinumFetchedAt]);

	useEffect(() => {
		let hasSavedPath = false;

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
	}, [detectEeLogPath]);

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
				const rawCachedLookup = localStorage.getItem(RELIC_DAILY_MARKET_CACHE_KEY);
				if (rawCachedLookup) {
					const cachedLookup = JSON.parse(rawCachedLookup) as DailyMarketPriceLookup;
					if (
						cachedLookup.dayKey === todayKey &&
						cachedLookup.pricesBySlug &&
						cachedLookup.pricesByName
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
			const rewardDisplayName =
				resourceNames[normalizedRewardName] ||
				weaponNames[normalizedRewardName] ||
				warframeNames[normalizedRewardName] ||
				companionNames[normalizedRewardName] ||
				getRewardFallbackName(normalizedRewardName);

			const directPrice =
				marketLookup.pricesByName[normalizeMarketName(rewardDisplayName)] ??
				marketLookup.pricesBySlug[slugifyMarketName(rewardDisplayName)] ??
				0;

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
		warframeNames,
		weaponNames,
		companionNames,
		resourceNames,
	]);

	const applyInventoryData = useCallback((result: string) => {
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
			ownedMiscCounts.set(miscItem.ItemType, currentCount + miscItem.ItemCount);
		}

		const manifestMap = new Map<string, string>();
		for (const entry of manifest) {
			manifestMap.set(entry.uniqueName, entry.textureLocation);
		}

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
						owned: hasMainBlueprint,
						hasRecipe: hasMainBlueprint,
						imageUrl: mainBlueprintIcon,
					},
				];

				if (mainRecipe) {
					for (const ingredient of mainRecipe.ingredients) {
						const itemType = ingredient.ItemType;
						const hasRecipe = ownedBlueprints.has(
							itemType.replace("Component", "Blueprint"),
						);
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
							count: ingredient.ItemCount,
							owned: hasRecipe || hasEnoughMaterials,
							hasRecipe,
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
		console.log(wfList);
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

						const requirementTextureLocation = manifestMap.get(itemType) || "";
						const requirementImageUrl = requirementTextureLocation
							? `http://content.warframe.com/PublicExport${requirementTextureLocation}`
							: "";

						return {
							name: requirementName,
							count: ingredient.ItemCount,
							imageUrl: requirementImageUrl,
							owned: hasRecipe || hasEnoughMaterials,
							hasRecipe,
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

						const requirementTextureLocation = manifestMap.get(itemType) || "";
						const requirementImageUrl = requirementTextureLocation
							? `http://content.warframe.com/PublicExport${requirementTextureLocation}`
							: "";

						return {
							name: requirementName,
							count: ingredient.ItemCount,
							imageUrl: requirementImageUrl,
							owned: hasRecipe || hasEnoughMaterials,
							hasRecipe,
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
	}, [
		warframeData,
		weaponData,
		companionData,
		recipeData,
		weaponNames,
		warframeNames,
		companionNames,
		resourceNames,
		manifest,
	]);

	useEffect(() => {
		if (!inventory) {
			setAppWarframes([]);
			setAppWeapons([]);
			setAppCompanions([]);
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
			<Sidebar activeTab={activeTab} onTabChange={setAppActiveTab} />
			<main className="flex-1 min-h-0 p-2 pb-0">
				{activeTab === "foundry" ? (
					<FoundryPage
						error={error}
						onRefresh={refreshInventory}
					/>
				) : activeTab === "mastery-helper" ? (
					<div className="h-full">
						<MasteryHelperPage />
					</div>
				) : activeTab === "relic-planner" ? (
					<div className="h-full">
						<RelicPlannerPage />
					</div>
				) : (
					<ScrollArea className="h-full">
						<div className="h-full">
							<SettingsPage
								indexLoading={indexLoading}
								error={error}
								assets={assets}
								inventory={inventory}
								eeLogPath={eeLogPath}
								onEeLogPathChange={persistEeLogPath}
								onDetectEeLogPath={detectEeLogPath}
								eeLogDetectLoading={eeLogDetectLoading}
							/>
						</div>
					</ScrollArea>
				)}
			</main>
		</div>
	);
}

export default App;
