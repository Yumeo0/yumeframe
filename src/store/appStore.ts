import { Store } from "@tanstack/react-store";
import type { FoundryFilter } from "@/components/app/FoundryPage";
import type { OwnedCompanion, OwnedRelic, OwnedWeapon, Warframe } from "@/types";

export type AppTab = "foundry" | "mastery-helper" | "relic-planner" | "settings";

type Updater<T> = T | ((previous: T) => T);

function resolveUpdater<T>(value: Updater<T>, previous: T): T {
	if (typeof value === "function") {
		return (value as (previous: T) => T)(previous);
	}
	return value;
}

export interface AppState {
	activeTab: AppTab;
	foundryFilter: FoundryFilter;
	inventory: string;
	inventoryLoading: boolean;
	inventoryError: string;
	warframes: Warframe[];
	weapons: OwnedWeapon[];
	companions: OwnedCompanion[];
	relics: OwnedRelic[];
	visibleRewardNames: string[];
	rewardPlatinumValues: Record<string, number>;
	rewardPlatinumFetchedAt: Record<string, number>;
}

export const appStore = new Store<AppState>({
	activeTab: "foundry",
	foundryFilter: "warframes",
	inventory: "",
	inventoryLoading: false,
	inventoryError: "",
	warframes: [],
	weapons: [],
	companions: [],
	relics: [],
	visibleRewardNames: [],
	rewardPlatinumValues: {},
	rewardPlatinumFetchedAt: {},
});

function updateStoreSlice<Key extends keyof AppState>(
	key: Key,
	value: Updater<AppState[Key]>,
) {
	appStore.setState((previousState) => ({
		...previousState,
		[key]: resolveUpdater(value, previousState[key]),
	}));
}

export function setAppActiveTab(value: AppTab) {
	updateStoreSlice("activeTab", value);
}

export function setAppFoundryFilter(value: FoundryFilter) {
	updateStoreSlice("foundryFilter", value);
}

export function setAppInventory(value: Updater<string>) {
	updateStoreSlice("inventory", value);
}

export function setAppInventoryLoading(value: Updater<boolean>) {
	updateStoreSlice("inventoryLoading", value);
}

export function setAppInventoryError(value: Updater<string>) {
	updateStoreSlice("inventoryError", value);
}

export function setAppWarframes(value: Updater<Warframe[]>) {
	updateStoreSlice("warframes", value);
}

export function setAppWeapons(value: Updater<OwnedWeapon[]>) {
	updateStoreSlice("weapons", value);
}

export function setAppCompanions(value: Updater<OwnedCompanion[]>) {
	updateStoreSlice("companions", value);
}

export function setAppRelics(value: Updater<OwnedRelic[]>) {
	updateStoreSlice("relics", value);
}

export function setAppVisibleRewardNames(value: Updater<string[]>) {
	updateStoreSlice("visibleRewardNames", value);
}

export function setAppRewardPlatinumValues(
	value: Updater<Record<string, number>>,
) {
	updateStoreSlice("rewardPlatinumValues", value);
}

export function setAppRewardPlatinumFetchedAt(
	value: Updater<Record<string, number>>,
) {
	updateStoreSlice("rewardPlatinumFetchedAt", value);
}
