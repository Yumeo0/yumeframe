import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type {
	AssetEntry,
	Companion,
	ExportCompanionsWrapper,
	ExportRecipeEntry,
	ExportRecipesWrapper,
	ExportRelicArcaneWrapper,
	ExportResourcesWrapper,
	ExportWarframeEntry,
	ExportWarframesWrapper,
	ExportWeaponEntry,
	ExportWeaponsWrapper,
	ManifestEntry,
	RecipeData,
	VoidRelic,
} from "@/types";

export function useData() {
	const [assets, setAssets] = useState<AssetEntry[]>([]);
	const [manifest, setManifest] = useState<ManifestEntry[]>([]);
	const [warframeNames, setWarframeNames] = useState<Record<string, string>>({});
	const [warframeData, setWarframeData] = useState<
		Record<string, ExportWarframeEntry>
	>({});
	const [weaponNames, setWeaponNames] = useState<Record<string, string>>({});
	const [weaponData, setWeaponData] = useState<Record<string, ExportWeaponEntry>>({});
	const [companionNames, setCompanionNames] = useState<Record<string, string>>({});
	const [companionData, setCompanionData] = useState<Record<string, Companion>>({});
	const [relicData, setRelicData] = useState<Record<string, VoidRelic>>({});
	const [recipeData, setRecipeData] = useState<Record<string, RecipeData>>({});
	const [recipeDucatValues, setRecipeDucatValues] = useState<
		Record<string, number>
	>({});
	const [resourceNames, setResourceNames] = useState<Record<string, string>>({});
	const [indexLoading, setIndexLoading] = useState(true);
	const [error, setError] = useState("");

	const loadWarframeIndex = useCallback(async () => {
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
	}, []);

	useEffect(() => {
		loadWarframeIndex();
	}, [loadWarframeIndex]);

	useEffect(() => {
		if (assets.length === 0) {
			return;
		}

		let cancelled = false;

		async function loadData() {
			const normalizeStoreItemPath = (value: string) =>
				value.replace("/StoreItems", "");

			const getRecipeSpecificityScore = (recipe: ExportRecipeEntry): number => {
				const ingredients = Array.isArray(recipe.ingredients)
					? recipe.ingredients
					: [];
				const ingredientCount = ingredients.length;
				const nonMiscIngredientCount = ingredients.filter((ingredient) => {
					const category = ingredient.ProductCategory || "";
					return category !== "MiscItems";
				}).length;
				const hasWeaponOrUnitRequirement = ingredients.some((ingredient) =>
					["Melee", "LongGuns", "Pistols", "Sentinels", "Suits"].includes(
						ingredient.ProductCategory || "",
					),
				);

				return (
					ingredientCount * 10 +
					nonMiscIngredientCount * 50 +
					(hasWeaponOrUnitRequirement ? 250 : 0)
				);
			};

			const results = await Promise.allSettled([
				invoke<string>("fetch_warframe_manifest", { assets }),
				invoke<string>("fetch_warframe_data", { assets }),
				invoke<string>("fetch_weapon_data", { assets }),
				invoke<string>("fetch_companion_data", { assets }),
				invoke<string>("fetch_recipe_data", { assets }),
				invoke<string>("fetch_relic_data", { assets }),
				invoke<string>("fetch_resource_data", { assets }),
			]);

			if (cancelled) {
				return;
			}

			const [
				manifestResult,
				warframeResult,
				weaponResult,
				companionResult,
				recipeResult,
				relicResult,
				resourceResult,
			] = results;

			if (manifestResult.status === "fulfilled") {
				const manifestData = JSON.parse(manifestResult.value) as {
					Manifest?: ManifestEntry[];
				};
				setManifest(manifestData.Manifest || []);
			} else {
				console.error("Failed to load manifest:", manifestResult.reason);
			}

			if (warframeResult.status === "fulfilled") {
				const data: ExportWarframesWrapper = JSON.parse(warframeResult.value);
				const names: Record<string, string> = {};
				const exportData: Record<string, ExportWarframeEntry> = {};
				for (const wf of data.ExportWarframes) {
					names[wf.uniqueName] = wf.name;
					exportData[wf.uniqueName] = wf;
				}
				setWarframeNames(names);
				setWarframeData(exportData);
			} else {
				console.error("Failed to load warframe data:", warframeResult.reason);
			}

			if (weaponResult.status === "fulfilled") {
				const data: ExportWeaponsWrapper = JSON.parse(weaponResult.value);
				const names: Record<string, string> = {};
				const weaponMap: Record<string, ExportWeaponEntry> = {};
				for (const weapon of data.ExportWeapons) {
					names[weapon.uniqueName] = weapon.name;
					weaponMap[weapon.uniqueName] = weapon;
				}
				setWeaponNames(names);
				setWeaponData(weaponMap);
			} else {
				console.error("Failed to load weapon data:", weaponResult.reason);
			}

			if (companionResult.status === "fulfilled") {
				const data: ExportCompanionsWrapper = JSON.parse(companionResult.value);
				const names: Record<string, string> = {};
				const companionMap: Record<string, Companion> = {};
				for (const companion of data.ExportSentinels) {
					names[companion.uniqueName] = companion.name;
					companionMap[companion.uniqueName] = companion;
				}
				setCompanionNames(names);
				setCompanionData(companionMap);
			} else {
				console.error("Failed to load companion data:", companionResult.reason);
			}

			if (recipeResult.status === "fulfilled") {
				const data: ExportRecipesWrapper = JSON.parse(recipeResult.value);
				const recipes: Record<string, RecipeData> = {};
				const ducatValues: Record<string, number> = {};
				for (const recipe of data.ExportRecipes as ExportRecipeEntry[]) {
					const normalizedResultType = normalizeStoreItemPath(recipe.resultType);
					const normalizedRecipe: RecipeData = {
						...recipe,
						resultType: normalizedResultType,
						ingredients: (recipe.ingredients || []).map((ingredient) => ({
							...ingredient,
							ItemType: normalizeStoreItemPath(ingredient.ItemType),
						})),
						secretIngredients: (recipe.secretIngredients || []).map((ingredient) => ({
							...ingredient,
							ItemType: normalizeStoreItemPath(ingredient.ItemType),
						})),
					};

					const existingRecipe = recipes[normalizedResultType];
					if (!existingRecipe) {
						recipes[normalizedResultType] = normalizedRecipe;
					} else {
						const nextScore = getRecipeSpecificityScore(normalizedRecipe);
						const previousScore = getRecipeSpecificityScore(existingRecipe);
						if (nextScore > previousScore) {
							recipes[normalizedResultType] = normalizedRecipe;
						}
					}
					if (typeof recipe.primeSellingPrice === "number") {
						const normalizedUniqueName = normalizeStoreItemPath(
							recipe.uniqueName,
						);
						ducatValues[recipe.uniqueName] = recipe.primeSellingPrice;
						ducatValues[normalizedUniqueName] = recipe.primeSellingPrice;
						ducatValues[recipe.resultType] = recipe.primeSellingPrice;
						ducatValues[normalizedResultType] = recipe.primeSellingPrice;
					}
				}
				setRecipeData(recipes);
				setRecipeDucatValues(ducatValues);
			} else {
				console.error("Failed to load recipe data:", recipeResult.reason);
			}

			if (relicResult.status === "fulfilled") {
				const data: ExportRelicArcaneWrapper = JSON.parse(relicResult.value);
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
			} else {
				console.error("Failed to load relic data:", relicResult.reason);
			}

			if (resourceResult.status === "fulfilled") {
				const data: ExportResourcesWrapper = JSON.parse(resourceResult.value);
				const names: Record<string, string> = {};
				const resourceDucatValues: Record<string, number> = {};
				for (const resource of data.ExportResources) {
					names[resource.uniqueName] = resource.name;
					if (typeof resource.primeSellingPrice === "number") {
						const normalizedUniqueName = normalizeStoreItemPath(
							resource.uniqueName,
						);
						resourceDucatValues[resource.uniqueName] = resource.primeSellingPrice;
						resourceDucatValues[normalizedUniqueName] =
							resource.primeSellingPrice;
					}
				}
				setResourceNames(names);
				setRecipeDucatValues((previous) => ({
					...previous,
					...resourceDucatValues,
				}));
			} else {
				console.error("Failed to load resource data:", resourceResult.reason);
			}
		}

		loadData();

		return () => {
			cancelled = true;
		};
	}, [assets]);

	return {
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
		error,
	};
}
