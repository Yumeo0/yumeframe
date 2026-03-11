import { Store } from "@tanstack/react-store";
import type { FoundryFilter } from "@/components/app/FoundryPage";
import type {
	OwnedCompanion,
	OwnedRelic,
	OwnedWeapon,
	PendingRecipe,
	RelicScanEntry,
	Warframe,
} from "@/types";

export type AppTab =
	| "foundry"
	| "mastery-helper"
	| "relic-planner"
	| "relic-scanner"
	| "settings";

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
	inventoryAutoRefreshEnabled: boolean;
	inventoryAutoRefreshIntervalSeconds: number;
	inventoryLastRefreshAt: number | null;
	eeLogPath: string;
	inventory: string;
	inventoryLoading: boolean;
	inventoryError: string;
	warframes: Warframe[];
	weapons: OwnedWeapon[];
	companions: OwnedCompanion[];
	pendingRecipes: PendingRecipe[];
	relics: OwnedRelic[];
	visibleRewardNames: string[];
	rewardPlatinumValues: Record<string, number>;
	rewardPlatinumFetchedAt: Record<string, number>;
	relicScannerEnabled: boolean;
	relicOverlayEnabled: boolean;
	relicScannerHotkey: string;
	relicScannerStatus: "stopped" | "watching" | "error";
	relicScans: RelicScanEntry[];
}

export const appStore = new Store<AppState>({
	activeTab: "foundry",
	foundryFilter: "warframes",
	inventoryAutoRefreshEnabled: false,
	inventoryAutoRefreshIntervalSeconds: 180,
	inventoryLastRefreshAt: null,
	eeLogPath: "",
	inventory: "",
	inventoryLoading: false,
	inventoryError: "",
	warframes: [],
	weapons: [],
	companions: [],
	pendingRecipes: [],
	relics: [],
	visibleRewardNames: [],
	rewardPlatinumValues: {},
	rewardPlatinumFetchedAt: {},
	relicScannerEnabled: true,
	relicOverlayEnabled: false,
	relicScannerHotkey: "F11",
	relicScannerStatus: "stopped",
	relicScans: [],
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

export function setAppInventoryAutoRefreshEnabled(value: Updater<boolean>) {
	updateStoreSlice("inventoryAutoRefreshEnabled", value);
}

export function setAppInventoryAutoRefreshIntervalSeconds(
	value: Updater<number>,
) {
	updateStoreSlice("inventoryAutoRefreshIntervalSeconds", value);
}

export function setAppInventoryLastRefreshAt(value: Updater<number | null>) {
	updateStoreSlice("inventoryLastRefreshAt", value);
}

export function setAppInventory(value: Updater<string>) {
	updateStoreSlice("inventory", value);
}

export function setAppEeLogPath(value: Updater<string>) {
	updateStoreSlice("eeLogPath", value);
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

export function setAppPendingRecipes(value: Updater<PendingRecipe[]>) {
	updateStoreSlice("pendingRecipes", value);
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

export function setAppRelicScannerEnabled(value: Updater<boolean>) {
	updateStoreSlice("relicScannerEnabled", value);
}

export function setAppRelicOverlayEnabled(value: Updater<boolean>) {
	updateStoreSlice("relicOverlayEnabled", value);
}

export function setAppRelicScannerHotkey(value: Updater<string>) {
	updateStoreSlice("relicScannerHotkey", value);
}

export function setAppRelicScannerStatus(
	value: Updater<"stopped" | "watching" | "error">,
) {
	updateStoreSlice("relicScannerStatus", value);
}

export function setAppRelicScans(value: Updater<RelicScanEntry[]>) {
	updateStoreSlice("relicScans", value);
}
