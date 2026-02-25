import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useEffect, useRef, useState } from "react";
import { type FoundryFilter, FoundryPage } from "@/components/app/FoundryPage";
import { MasteryHelperPage } from "@/components/app/MasteryHelperPage";
import { RelicPlannerPage } from "@/components/app/RelicPlannerPage";
import { SettingsPage } from "@/components/app/SettingsPage";
import { Sidebar } from "@/components/app/Sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	calculateExpectedDucats,
	calculateExpectedPlatinum,
} from "@/lib/relics.utils";
import type {
	AssetEntry,
	Companion,
	ExportCompanionsWrapper,
	ExportRecipesWrapper,
	ExportRelicArcaneWrapper,
	ExportResourcesWrapper,
	ExportWarframeEntry,
	ExportWarframesWrapper,
	ExportWeaponEntry,
	ExportWeaponsWrapper,
	InventoryCompanionEntry,
	InventoryMiscItem,
	InventoryWeaponEntry,
	ManifestEntry,
	OwnedCompanion,
	OwnedRelic,
	OwnedWeapon,
	RecipeData,
	VoidRelic,
	Warframe,
	WarframePart,
	WarframeSuit,
} from "@/types";
import { WFMApiClient } from "../packages/wfm-api-client/src/index.js";

type Tab = "foundry" | "mastery-helper" | "relic-planner" | "settings";
const INVENTORY_CACHE_KEY = "yumeframe.inventory.cache";
const RELIC_PRICE_CACHE_KEY = "yumeframe.relic.price.cache";
const RELIC_PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const WFM_REQUEST_INTERVAL_MS = 350;
const wfmClient = new WFMApiClient(undefined, tauriFetch as typeof fetch);

function normalizeRewardGameRef(gameRef: string): string {
	return gameRef.replace("/StoreItems", "");
}

function estimateTopOrderPrice(orders: {
	buy: Array<{ platinum: number }>;
	sell: Array<{ platinum: number }>;
}): number {
	const bestBuy = orders.buy.length > 0 ? orders.buy[0].platinum : null;
	const bestSell = orders.sell.length > 0 ? orders.sell[0].platinum : null;

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
	const [inventory, setInventory] = useState("");
	const [assets, setAssets] = useState<AssetEntry[]>([]);
	const [manifest, setManifest] = useState<ManifestEntry[]>([]);
	const [warframes, setWarframes] = useState<Warframe[]>([]);
	const [weapons, setWeapons] = useState<OwnedWeapon[]>([]);
	const [companions, setCompanions] = useState<OwnedCompanion[]>([]);
	const [warframeNames, setWarframeNames] = useState<Record<string, string>>(
		{},
	);
	const [warframeData, setWarframeData] = useState<
		Record<string, ExportWarframeEntry>
	>({});
	const [weaponNames, setWeaponNames] = useState<Record<string, string>>({});
	const [weaponData, setWeaponData] = useState<
		Record<string, ExportWeaponEntry>
	>({});
	const [companionNames, setCompanionNames] = useState<Record<string, string>>(
		{},
	);
	const [companionData, setCompanionData] = useState<Record<string, Companion>>(
		{},
	);
	const [relicData, setRelicData] = useState<Record<string, VoidRelic>>({});
	const [relics, setRelics] = useState<OwnedRelic[]>([]);
	const [wfmItemSlugsByGameRef, setWfmItemSlugsByGameRef] = useState<
		Record<string, string>
	>({});
	const [visibleRewardNames, setVisibleRewardNames] = useState<string[]>([]);
	const [rewardPlatinumValues, setRewardPlatinumValues] = useState<
		Record<string, number>
	>({});
	const [rewardPlatinumFetchedAt, setRewardPlatinumFetchedAt] = useState<
		Record<string, number>
	>({});
	const rewardPlatinumValuesRef = useRef<Record<string, number>>({});
	const rewardPlatinumFetchedAtRef = useRef<Record<string, number>>({});
	const rewardPlatinumFetchInFlightRef = useRef(new Set<string>());
	const rewardPriceQueueRef = useRef(new Map<string, string>());
	const rewardPriceWorkerRunningRef = useRef(false);
	const lastRewardPriceRequestAtRef = useRef(0);
	const visibleNormalizedRewardNamesRef = useRef(new Set<string>());
	const [recipeDucatValues, setRecipeDucatValues] = useState<
		Record<string, number>
	>({});
	const [resourceNames, setResourceNames] = useState<Record<string, string>>(
		{},
	);
	const [recipeData, setRecipeData] = useState<Record<string, RecipeData>>({});
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [indexLoading, setIndexLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<Tab>("foundry");
	const [foundryFilter, setFoundryFilter] =
		useState<FoundryFilter>("warframes");
	const [cachedInventoryOnStart, setCachedInventoryOnStart] = useState<
		string | null
	>(null);
	const [startupCacheHydrated, setStartupCacheHydrated] = useState(false);

	// Load Warframe asset index on app start
	// biome-ignore lint/correctness/useExhaustiveDependencies: loadWarframeIndex changes on every re-render and should not be used as a hook dependency
	useEffect(() => {
		loadWarframeIndex();
	}, []);

	useEffect(() => {
		try {
			const cachedInventory = localStorage.getItem(INVENTORY_CACHE_KEY);
			if (cachedInventory) {
				setInventory(cachedInventory);
				setCachedInventoryOnStart(cachedInventory);
			}
		} catch (err) {
			console.error("Failed to read cached inventory:", err);
		}
	}, []);

	useEffect(() => {
		rewardPlatinumValuesRef.current = rewardPlatinumValues;
	}, [rewardPlatinumValues]);

	useEffect(() => {
		rewardPlatinumFetchedAtRef.current = rewardPlatinumFetchedAt;
	}, [rewardPlatinumFetchedAt]);

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

			const now = Date.now();
			const validFetchedAt: Record<string, number> = {};
			const validValues: Record<string, number> = {};

			for (const [rewardName, fetchedAt] of Object.entries(
				parsed.fetchedAt ?? {},
			)) {
				if (now - fetchedAt <= RELIC_PRICE_CACHE_TTL_MS) {
					validFetchedAt[rewardName] = fetchedAt;
					if (parsed.values?.[rewardName] !== undefined) {
						validValues[rewardName] = parsed.values[rewardName];
					}
				}
			}

			rewardPlatinumFetchedAtRef.current = validFetchedAt;
			rewardPlatinumValuesRef.current = validValues;
			setRewardPlatinumFetchedAt(validFetchedAt);
			setRewardPlatinumValues(validValues);
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

	// Load manifest when assets are ready
	// biome-ignore lint/correctness/useExhaustiveDependencies: assets dependency is intentional
	useEffect(() => {
		if (assets.length > 0) {
			loadManifest();
			loadWarframeNames();
			loadWeaponData();
			loadCompanionData();
			loadRelicData();
			loadRecipeData();
			loadResourceData();
		}
	}, [assets]);

	useEffect(() => {
		if (!inventory) {
			setRelics([]);
			return;
		}

		try {
			const inventoryData = JSON.parse(inventory) as Record<string, unknown>;
			setRelics(
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
			setRelics([]);
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
		let isCancelled = false;

		async function loadWfmItems() {
			try {
				const response = await wfmClient.getItems();
				const items = response.data ?? [];
				const slugsByGameRef: Record<string, string> = {};

				for (const item of items) {
					const normalizedGameRef = normalizeRewardGameRef(item.gameRef);
					slugsByGameRef[normalizedGameRef] = item.slug;
				}

				if (!isCancelled) {
					setWfmItemSlugsByGameRef(slugsByGameRef);
				}
			} catch (err) {
				console.error("Failed to load WFM item list:", err);
			}
		}

		loadWfmItems();

		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		visibleNormalizedRewardNamesRef.current = new Set(
			visibleRewardNames.map((rewardName) =>
				normalizeRewardGameRef(rewardName),
			),
		);
	}, [visibleRewardNames]);

	useEffect(() => {
		if (
			visibleRewardNames.length === 0 ||
			Object.keys(wfmItemSlugsByGameRef).length === 0
		) {
			return;
		}

		const missingRewards = new Map<string, string>();
		const now = Date.now();
		for (const rewardName of visibleRewardNames) {
			const normalizedRewardName = normalizeRewardGameRef(rewardName);
			const lastFetchedAt =
				rewardPlatinumFetchedAtRef.current[normalizedRewardName];
			const isFresh =
				lastFetchedAt !== undefined &&
				now - lastFetchedAt <= RELIC_PRICE_CACHE_TTL_MS;

			if (
				isFresh &&
				rewardPlatinumValuesRef.current[normalizedRewardName] !== undefined
			) {
				continue;
			}

			if (rewardPlatinumFetchInFlightRef.current.has(normalizedRewardName)) {
				continue;
			}

			const rewardSlug = wfmItemSlugsByGameRef[normalizedRewardName];
			if (!rewardSlug) {
				const fetchedAt = Date.now();
				rewardPlatinumValuesRef.current = {
					...rewardPlatinumValuesRef.current,
					[normalizedRewardName]: 0,
				};
				rewardPlatinumFetchedAtRef.current = {
					...rewardPlatinumFetchedAtRef.current,
					[normalizedRewardName]: fetchedAt,
				};
				setRewardPlatinumValues((previous) => ({
					...previous,
					[normalizedRewardName]: 0,
				}));
				setRewardPlatinumFetchedAt((previous) => ({
					...previous,
					[normalizedRewardName]: fetchedAt,
				}));
				continue;
			}

			missingRewards.set(normalizedRewardName, rewardSlug);
		}

		if (missingRewards.size === 0) {
			return;
		}

		for (const [rewardName, slug] of missingRewards.entries()) {
			rewardPriceQueueRef.current.set(rewardName, slug);
		}

		const sleep = (ms: number) =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, ms);
			});

		const processQueue = async () => {
			if (rewardPriceWorkerRunningRef.current) {
				return;
			}

			rewardPriceWorkerRunningRef.current = true;
			try {
				while (rewardPriceQueueRef.current.size > 0) {
					const firstEntry = rewardPriceQueueRef.current.entries().next().value as
						| [string, string]
						| undefined;
					if (!firstEntry) {
						break;
					}

					const [rewardName, slug] = firstEntry;
					rewardPriceQueueRef.current.delete(rewardName);

					if (!visibleNormalizedRewardNamesRef.current.has(rewardName)) {
						continue;
					}

					const lastFetchedAt = rewardPlatinumFetchedAtRef.current[rewardName];
					const isFresh =
						lastFetchedAt !== undefined &&
						Date.now() - lastFetchedAt <= RELIC_PRICE_CACHE_TTL_MS;
					if (isFresh && rewardPlatinumValuesRef.current[rewardName] !== undefined) {
						continue;
					}

					const sinceLastRequest =
						Date.now() - lastRewardPriceRequestAtRef.current;
					if (sinceLastRequest < WFM_REQUEST_INTERVAL_MS) {
						await sleep(WFM_REQUEST_INTERVAL_MS - sinceLastRequest);
					}

					rewardPlatinumFetchInFlightRef.current.add(rewardName);
					lastRewardPriceRequestAtRef.current = Date.now();

					try {
						const topOrdersResponse = await wfmClient.getTopOrdersByItem(slug);
						const topOrders = topOrdersResponse.data;
						const price = topOrders ? estimateTopOrderPrice(topOrders) : 0;
						const fetchedAt = Date.now();
						rewardPlatinumValuesRef.current = {
							...rewardPlatinumValuesRef.current,
							[rewardName]: price,
						};
						rewardPlatinumFetchedAtRef.current = {
							...rewardPlatinumFetchedAtRef.current,
							[rewardName]: fetchedAt,
						};
						setRewardPlatinumValues((previous) => ({
							...previous,
							[rewardName]: price,
						}));
						setRewardPlatinumFetchedAt((previous) => ({
							...previous,
							[rewardName]: fetchedAt,
						}));
					} catch (err) {
						console.error(`Failed to load order price for ${slug}:`, err);
						const fetchedAt = Date.now();
						rewardPlatinumValuesRef.current = {
							...rewardPlatinumValuesRef.current,
							[rewardName]: 0,
						};
						rewardPlatinumFetchedAtRef.current = {
							...rewardPlatinumFetchedAtRef.current,
							[rewardName]: fetchedAt,
						};
						setRewardPlatinumValues((previous) => ({
							...previous,
							[rewardName]: 0,
						}));
						setRewardPlatinumFetchedAt((previous) => ({
							...previous,
							[rewardName]: fetchedAt,
						}));
					} finally {
						rewardPlatinumFetchInFlightRef.current.delete(rewardName);
					}
				}
			} finally {
				rewardPriceWorkerRunningRef.current = false;
			}
		};

		processQueue();
	}, [
		visibleRewardNames,
		wfmItemSlugsByGameRef,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: startup cache hydration intentionally waits for multiple loaded datasets
	useEffect(() => {
		if (startupCacheHydrated || !cachedInventoryOnStart) {
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
			applyInventoryData(cachedInventoryOnStart);
			setStartupCacheHydrated(true);
			console.log("Loaded inventory from cache");
		} catch (err) {
			console.error("Failed to hydrate cached inventory:", err);
			setStartupCacheHydrated(true);
		}
	}, [
		startupCacheHydrated,
		cachedInventoryOnStart,
		warframeData,
		weaponData,
		companionData,
		manifest,
		recipeData,
		resourceNames,
		warframeNames,
		weaponNames,
		companionNames,
	]);

	async function loadWarframeIndex() {
		setIndexLoading(true);
		setError("");
		try {
			const result = await invoke<AssetEntry[]>("fetch_warframe_index");
			setAssets(result);
			console.log(`Loaded ${result.length} asset entries`);
		} catch (err) {
			setError(`Failed to load asset index: ${err}`);
			console.error(err);
		} finally {
			setIndexLoading(false);
		}
	}

	async function loadManifest() {
		try {
			const result = await invoke<string>("fetch_warframe_manifest", {
				assets,
			});
			const manifestData = JSON.parse(result);
			setManifest(manifestData.Manifest || []);
			console.log("Manifest loaded successfully");
		} catch (err) {
			console.error("Failed to load manifest:", err);
		}
	}

	async function loadWarframeNames() {
		try {
			const rawJson = await invoke<string>("fetch_warframe_data", { assets });
			const data: ExportWarframesWrapper = JSON.parse(rawJson);

			const names: Record<string, string> = {};
			const exportData: Record<string, ExportWarframeEntry> = {};
			for (const wf of data.ExportWarframes) {
				names[wf.uniqueName] = wf.name;
				exportData[wf.uniqueName] = wf;
			}

			setWarframeNames(names);
			setWarframeData(exportData);
			console.log(`Loaded ${Object.keys(names).length} warframe names`);
		} catch (err) {
			console.error("Failed to load warframe names:", err);
		}
	}

	async function loadWeaponData() {
		try {
			const rawJson = await invoke<string>("fetch_weapon_data", { assets });
			const data: ExportWeaponsWrapper = JSON.parse(rawJson);

			const names: Record<string, string> = {};
			const weaponMap: Record<string, ExportWeaponEntry> = {};
			for (const weapon of data.ExportWeapons) {
				names[weapon.uniqueName] = weapon.name;
				weaponMap[weapon.uniqueName] = weapon;
			}

			setWeaponNames(names);
			setWeaponData(weaponMap);
			console.log(`Loaded ${Object.keys(names).length} weapon names`);
		} catch (err) {
			console.error("Failed to load weapon data:", err);
		}
	}

	async function loadCompanionData() {
		try {
			const rawJson = await invoke<string>("fetch_companion_data", { assets });
			const data: ExportCompanionsWrapper = JSON.parse(rawJson);

			const names: Record<string, string> = {};
			const companionMap: Record<string, Companion> = {};
			for (const companion of data.ExportSentinels) {
				names[companion.uniqueName] = companion.name;
				companionMap[companion.uniqueName] = companion;
			}

			setCompanionNames(names);
			setCompanionData(companionMap);
			console.log(`Loaded ${Object.keys(names).length} companions`);
		} catch (err) {
			console.error("Failed to load companion data:", err);
		}
	}

	async function loadRecipeData() {
		try {
			const rawJson = await invoke<string>("fetch_recipe_data", { assets });
			const data: ExportRecipesWrapper = JSON.parse(rawJson);

			const recipes: Record<string, RecipeData> = {};
			const ducatValues: Record<string, number> = {};
			for (const recipe of data.ExportRecipes) {
				recipes[recipe.resultType] = recipe;
				if (typeof recipe.primeSellingPrice === "number") {
					ducatValues[recipe.uniqueName] = recipe.primeSellingPrice;
					ducatValues[recipe.resultType] = recipe.primeSellingPrice;
				}
			}

			setRecipeData(recipes);
			setRecipeDucatValues(ducatValues);
			console.log(`Loaded ${Object.keys(recipes).length} recipes`);
		} catch (err) {
			console.error("Failed to load recipe data:", err);
		}
	}

	async function loadRelicData() {
		try {
			const rawJson = await invoke<string>("fetch_relic_data", { assets });
			const data: ExportRelicArcaneWrapper = JSON.parse(rawJson);

			const relicMap: Record<string, VoidRelic> = {};
			for (const entry of data.ExportRelicArcane || []) {
				if (
					entry.uniqueName?.includes("/Lotus/Types/Game/Projections/") &&
					Array.isArray(entry.relicRewards)
				) {
					relicMap[entry.uniqueName] = entry;
				}
			}

			setRelicData(relicMap);
			console.log(`Loaded ${Object.keys(relicMap).length} relic entries`);
		} catch (err) {
			console.error("Failed to load relic data:", err);
		}
	}

	async function loadResourceData() {
		try {
			const rawJson = await invoke<string>("fetch_resource_data", { assets });
			const data: ExportResourcesWrapper = JSON.parse(rawJson);

			const names: Record<string, string> = {};
			for (const resource of data.ExportResources) {
				names[resource.uniqueName] = resource.name;
			}

			setResourceNames(names);
			console.log(`Loaded ${Object.keys(names).length} resource names`);
		} catch (err) {
			console.error("Failed to load resource data:", err);
		}
	}

	function applyInventoryData(result: string) {
		const inventoryData = JSON.parse(result);
		const suits: WarframeSuit[] = inventoryData.Suits || [];
		const spaceSuits: WarframeSuit[] = inventoryData.SpaceSuits || [];
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
		setRelics(
			buildOwnedRelics(
				inventoryData,
				relicData,
				manifest,
				recipeDucatValues,
				rewardPlatinumValues,
				rewardPlatinumFetchedAt,
			),
		);

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
					parts,
				};
			},
		);

		wfList.sort((a, b) => a.displayName.localeCompare(b.displayName));
		setWarframes(wfList);

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
		setWeapons(allWeapons);

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
		setCompanions(allCompanions);

		console.log(
			`Loaded ${wfList.length} warframes/archwings (${suits.length} warframes + ${spaceSuits.length} archwings owned)`,
		);
		console.log(
			`Loaded ${allWeapons.length} weapons (${ownedWeaponDetails.size} owned in inventory categories)`,
		);
		console.log(
			`Loaded ${allCompanions.length} companions (${ownedCompanionDetails.size} owned from Sentinels/KubrowPets)`,
		);
	}

	async function fetchInventory() {
		setLoading(true);
		setError("");
		try {
			const result = await invoke<string>("fetch_warframe_inventory");
			setInventory(result);
			setCachedInventoryOnStart(result);
			setStartupCacheHydrated(true);

			try {
				localStorage.setItem(INVENTORY_CACHE_KEY, result);
			} catch (err) {
				console.error("Failed to cache inventory:", err);
			}

			applyInventoryData(result);
		} catch (err) {
			setError(`Error: ${err}`);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			<Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
			<main className="flex-1 min-h-0 p-2">
				{activeTab === "foundry" ? (
					<FoundryPage
						foundryFilter={foundryFilter}
						onFilterChange={setFoundryFilter}
						loading={loading}
						error={error}
						warframes={warframes}
						weapons={weapons}
						companions={companions}
						onRefresh={fetchInventory}
					/>
				) : activeTab === "mastery-helper" ? (
					<div className="h-full">
						<MasteryHelperPage
							inventory={inventory}
							warframes={warframes}
							weapons={weapons}
							companions={companions}
						/>
					</div>
				) : activeTab === "relic-planner" ? (
					<div className="h-full">
						<RelicPlannerPage
							inventory={inventory}
							relics={relics}
							onVisibleRewardsChange={(rewardNames) => {
								const normalized = [...new Set(rewardNames)].sort();
								setVisibleRewardNames((previous) => {
									if (
										previous.length === normalized.length &&
										previous.every((value, index) => value === normalized[index])
									) {
										return previous;
									}
									return normalized;
								});
							}}
						/>
					</div>
				) : (
					<ScrollArea className="h-full">
						<div className="h-full">
							<SettingsPage
								indexLoading={indexLoading}
								error={error}
								assets={assets}
								inventory={inventory}
							/>
						</div>
					</ScrollArea>
				)}
			</main>
		</div>
	);
}

export default App;
