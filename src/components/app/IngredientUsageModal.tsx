import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CollectionItem } from "@/components/app/foundry.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface IngredientUsageModalProps {
	item: CollectionItem;
	usedInItems: CollectionItem[];
	onOpenCraftingTree: (item: CollectionItem) => void;
	onClose: () => void;
}

export function IngredientUsageModal({
	item,
	usedInItems,
	onOpenCraftingTree,
	onClose,
}: IngredientUsageModalProps) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	useEffect(() => {
		const previousBodyOverflow = document.body.style.overflow;
		const previousHtmlOverflow = document.documentElement.style.overflow;

		document.body.style.overflow = "hidden";
		document.documentElement.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousBodyOverflow;
			document.documentElement.style.overflow = previousHtmlOverflow;
		};
	}, []);

	const modalContent = (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-label="Ingredient usage"
		>
			<button
				type="button"
				aria-label="Close ingredient usage"
				className="absolute inset-0 bg-black/70"
				onClick={onClose}
			/>
			<div className="relative w-full max-w-4xl overflow-hidden rounded-xl border bg-background shadow-2xl">
				<div className="flex items-center justify-between px-4 py-3 border-b">
					<div>
						<h2 className="text-lg font-semibold">Used As Ingredient</h2>
						<p className="text-sm text-muted-foreground">
							{item.displayName} is required for {usedInItems.length} item
							{usedInItems.length === 1 ? "" : "s"}.
						</p>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						Close
					</Button>
				</div>

				<div className="max-h-[70vh] overflow-y-auto p-4">
					{usedInItems.length > 0 ? (
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{usedInItems.map((targetItem) => (
								<Card key={`${item.key}-${targetItem.key}`} className="transition-colors hover:bg-muted/50">
									<button
										type="button"
										className="w-full text-left"
										onClick={() => onOpenCraftingTree(targetItem)}
									>
										<CardContent className="flex items-center gap-3 p-3">
											<img
												src={targetItem.imageUrl}
												alt={targetItem.displayName}
												className="size-12 rounded object-cover"
											/>
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{targetItem.displayName}
												</p>
												<p className="text-xs text-muted-foreground">
													{targetItem.owned ? "Owned" : "Not owned"}
												</p>
											</div>
										</CardContent>
									</button>
								</Card>
							))}
						</div>
					) : (
						<div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
							No recipes currently use this item as an ingredient.
						</div>
					)}
				</div>
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
}
