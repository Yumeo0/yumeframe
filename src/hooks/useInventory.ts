import { useStore } from "@tanstack/react-store";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect } from "react";
import {
	appStore,
	setAppInventory,
	setAppInventoryError,
	setAppInventoryLastRefreshAt,
	setAppInventoryLoading,
} from "@/store/appStore";

const INVENTORY_CACHE_KEY = "yumeframe.inventory.cache";

export function useInventory() {
	const inventory = useStore(appStore, (state) => state.inventory);
	const loading = useStore(appStore, (state) => state.inventoryLoading);
	const error = useStore(appStore, (state) => state.inventoryError);

	useEffect(() => {
		try {
			const cachedInventory = localStorage.getItem(INVENTORY_CACHE_KEY);
			if (cachedInventory) {
				setAppInventory(cachedInventory);
			}
		} catch (err) {
			console.error("Failed to read cached inventory:", err);
		}
	}, []);

	const refreshInventory = useCallback(async () => {
		setAppInventoryLoading(true);
		setAppInventoryError("");

		try {
			const result = await invoke<string>("fetch_warframe_inventory");
			setAppInventory(result);
			setAppInventoryLastRefreshAt(Date.now());

			try {
				localStorage.setItem(INVENTORY_CACHE_KEY, result);
			} catch (err) {
				console.error("Failed to cache inventory:", err);
			}
		} catch (err) {
			setAppInventoryError(`Error: ${err}`);
		} finally {
			setAppInventoryLoading(false);
		}
	}, []);

	return {
		inventory,
		setInventory: setAppInventory,
		loading,
		error,
		refreshInventory,
	};
}
