import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
	CollectionItem,
	CollectionPart,
} from "@/components/app/foundry.types";
import { Button } from "@/components/ui/button";

interface CraftingTreeModalProps {
	item: CollectionItem;
	allItems: CollectionItem[];
	onClose: () => void;
}

interface CraftingTreeNode {
	id: string;
	name: string;
	imageUrl: string;
	count?: number;
	owned?: boolean;
	hasRecipe?: boolean;
	isCraftable: boolean;
	children: CraftingTreeNode[];
}

interface PositionedNode {
	id: string;
	name: string;
	imageUrl: string;
	count?: number;
	owned?: boolean;
	hasRecipe?: boolean;
	isCraftable: boolean;
	x: number;
	y: number;
}

interface TreeEdge {
	from: string;
	to: string;
}

interface TreeLayout {
	nodes: PositionedNode[];
	edges: TreeEdge[];
	width: number;
	height: number;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 86;
const H_GAP = 20;
const V_GAP = 132;
const MAX_DEPTH = 8;

function normalizeCraftName(value: string): string {
	return value.trim().toLowerCase();
}

function getNameCandidatesForPart(part: CollectionPart): string[] {
	const candidates = new Set<string>();
	const baseName = part.name.trim();

	candidates.add(baseName);

	// Parts frequently appear as "<Part Name> Blueprint" in requirements.
	const withoutBlueprintSuffix = baseName.replace(/\s+blueprint$/i, "").trim();
	if (withoutBlueprintSuffix.length > 0) {
		candidates.add(withoutBlueprintSuffix);
	}

	return [...candidates];
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Reingold–Tilford "tidy" tree layout (Buchheim et al., O(n))
// ---------------------------------------------------------------------------

const SPACING = NODE_WIDTH + H_GAP;

interface RTNode {
	// Source data
	id: string;
	name: string;
	imageUrl: string;
	count?: number;
	owned?: boolean;
	hasRecipe?: boolean;
	isCraftable: boolean;
	// Tree structure
	parent: RTNode | null;
	children: RTNode[];
	leftSibling: RTNode | null;
	depth: number;
	// Final position (x = centre)
	x: number;
	y: number;
	// Buchheim algorithm fields
	prelim: number;
	mod: number;
	shift: number;
	change: number;
	ancestor: RTNode; // self-reference initially
	thread: RTNode | null;
}

function buildRTTree(
	src: CraftingTreeNode,
	parent: RTNode | null,
	depth: number,
	prevSibling: RTNode | null,
): RTNode {
	const node: RTNode = {
		id: src.id,
		name: src.name,
		imageUrl: src.imageUrl,
		count: src.count,
		owned: src.owned,
		hasRecipe: src.hasRecipe,
		isCraftable: src.isCraftable,
		parent,
		children: [],
		leftSibling: prevSibling,
		depth,
		x: 0,
		y: depth * V_GAP,
		prelim: 0,
		mod: 0,
		shift: 0,
		change: 0,
		ancestor: null as unknown as RTNode,
		thread: null,
	};
	node.ancestor = node;
	let prev: RTNode | null = null;
	for (const child of src.children) {
		const c = buildRTTree(child, node, depth + 1, prev);
		node.children.push(c);
		prev = c;
	}
	return node;
}

function rtNextLeft(v: RTNode): RTNode | null {
	return v.children.length > 0 ? v.children[0] : v.thread;
}

function rtNextRight(v: RTNode): RTNode | null {
	const n = v.children.length;
	return n > 0 ? v.children[n - 1] : v.thread;
}

function rtMoveSubtree(wm: RTNode, wp: RTNode, shift: number): void {
	const p = wp.parent;
	if (!p) return;
	const subtrees = p.children.indexOf(wp) - p.children.indexOf(wm);
	if (subtrees <= 0) return;
	wp.change -= shift / subtrees;
	wp.shift += shift;
	wm.change += shift / subtrees;
	wp.prelim += shift;
	wp.mod += shift;
}

function rtExecuteShifts(v: RTNode): void {
	let shift = 0;
	let change = 0;
	for (let i = v.children.length - 1; i >= 0; i--) {
		const w = v.children[i];
		w.prelim += shift;
		w.mod += shift;
		change += w.change;
		shift += w.shift + change;
	}
}

function rtAncestor(vil: RTNode, v: RTNode, da: RTNode): RTNode {
	return v.parent?.children.includes(vil.ancestor) ? vil.ancestor : da;
}

function rtApportion(v: RTNode, defaultAncestor: RTNode): RTNode {
	const w = v.leftSibling;
	if (w === null) return defaultAncestor;
	const parent = v.parent;
	if (parent === null) return defaultAncestor;

	let vir: RTNode = v;
	let vor: RTNode = v;
	let vil: RTNode = w;
	let vol: RTNode = parent.children[0];

	let sir = vir.mod;
	let sor = vor.mod;
	let sil = vil.mod;
	let sol = vol.mod;

	let rVil = rtNextRight(vil);
	let lVir = rtNextLeft(vir);

	while (rVil !== null && lVir !== null) {
		vil = rVil;
		vir = lVir;
		// Advance outer contours; threads guarantee these are non-null
		// while the inner contours still have nodes.
		const nextVol = rtNextLeft(vol);
		const nextVor = rtNextRight(vor);
		if (nextVol === null || nextVor === null) break;
		vol = nextVol;
		vor = nextVor;
		vor.ancestor = v;

		const shift = (vil.prelim + sil) - (vir.prelim + sir) + SPACING;
		if (shift > 0) {
			rtMoveSubtree(rtAncestor(vil, v, defaultAncestor), v, shift);
			sir += shift;
			sor += shift;
		}

		sil += vil.mod;
		sir += vir.mod;
		sol += vol.mod;
		sor += vor.mod;

		rVil = rtNextRight(vil);
		lVir = rtNextLeft(vir);
	}

	// Set threads to extend shorter contours.
	if (rVil !== null && rtNextRight(vor) === null) {
		vor.thread = rVil;
		vor.mod += sil - sor;
	}
	if (lVir !== null && rtNextLeft(vol) === null) {
		vol.thread = lVir;
		vol.mod += sir - sol;
		defaultAncestor = v;
	}

	return defaultAncestor;
}

function rtFirstWalk(v: RTNode): void {
	if (v.children.length === 0) {
		v.prelim = v.leftSibling ? v.leftSibling.prelim + SPACING : 0;
		return;
	}

	let da = v.children[0];
	for (const w of v.children) {
		rtFirstWalk(w);
		da = rtApportion(w, da);
	}
	rtExecuteShifts(v);

	const mid =
		(v.children[0].prelim + v.children[v.children.length - 1].prelim) / 2;
	if (v.leftSibling) {
		v.prelim = v.leftSibling.prelim + SPACING;
		v.mod = v.prelim - mid;
	} else {
		v.prelim = mid;
	}
}

function rtSecondWalk(
	v: RTNode,
	modSum: number,
	nodes: PositionedNode[],
	edges: TreeEdge[],
	bounds: { maxX: number; maxDepth: number },
): void {
	v.x = v.prelim + modSum;
	nodes.push({
		id: v.id,
		name: v.name,
		imageUrl: v.imageUrl,
		count: v.count,
		owned: v.owned,
		hasRecipe: v.hasRecipe,
		isCraftable: v.isCraftable,
		x: v.x,
		y: v.y,
	});
	bounds.maxX = Math.max(bounds.maxX, v.x);
	bounds.maxDepth = Math.max(bounds.maxDepth, v.depth);

	for (const child of v.children) {
		edges.push({ from: v.id, to: child.id });
		rtSecondWalk(child, modSum + v.mod, nodes, edges, bounds);
	}
}

function buildTreeLayout(root: CraftingTreeNode): TreeLayout {
	const rtRoot = buildRTTree(root, null, 0, null);
	rtFirstWalk(rtRoot);

	const nodes: PositionedNode[] = [];
	const edges: TreeEdge[] = [];
	const bounds = { maxX: 0, maxDepth: 0 };
	rtSecondWalk(rtRoot, 0, nodes, edges, bounds);

	// Shift so the leftmost centre sits at NODE_WIDTH / 2 (small left margin).
	if (nodes.length > 0) {
		const minX = Math.min(...nodes.map((n) => n.x));
		const shift = NODE_WIDTH / 2 - minX;
		for (const n of nodes) n.x += shift;
		bounds.maxX += shift;
	}

	return {
		nodes,
		edges,
		width: Math.max(600, bounds.maxX + NODE_WIDTH / 2 + 40),
		height: Math.max(700, (bounds.maxDepth + 1) * V_GAP + NODE_HEIGHT + 60),
	};
}

function getNodeStatus(node: PositionedNode): string {
	if (node.owned === true) {
		return "Owned";
	}
	if (node.owned === false && node.hasRecipe === true) {
		return "Blueprint Owned";
	}
	if (node.owned === false) {
		return "Missing";
	}
	return node.isCraftable ? "Craftable" : "Material";
}

function getNodeStateClass(node: PositionedNode): string {
	if (node.owned === true) {
		return "border-green-500/60 bg-green-500/10";
	}
	if (node.owned === false && node.hasRecipe === true) {
		return "border-white/70 bg-white/10";
	}
	if (node.owned === false) {
		return "border-amber-500/60 bg-amber-500/10";
	}
	return "border-border bg-card";
}

export function CraftingTreeModal({
	item,
	allItems,
	onClose,
}: CraftingTreeModalProps) {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const scaleRef = useRef(1);
	const offsetRef = useRef({ x: 40, y: 40 });
	const dragRef = useRef<{
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 40, y: 40 });

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		offsetRef.current = offset;
	}, [offset]);

	const byType = useMemo(() => {
		const map = new Map<string, CollectionItem>();
		for (const entry of allItems) {
			map.set(entry.key, entry);
		}
		return map;
	}, [allItems]);

	const byName = useMemo(() => {
		const map = new Map<string, CollectionItem[]>();
		for (const entry of allItems) {
			for (const value of [entry.displayName, entry.name]) {
				const normalized = normalizeCraftName(value);
				const existing = map.get(normalized);
				if (existing) {
					existing.push(entry);
				} else {
					map.set(normalized, [entry]);
				}
			}
		}
		return map;
	}, [allItems]);

	const resolveCraftableItem = useCallback(
		(part: CollectionPart): CollectionItem | undefined => {
			if (part.itemType) {
				const exact = byType.get(part.itemType);
				if (exact) {
					return exact;
				}
			}

			for (const candidate of getNameCandidatesForPart(part)) {
				const matches = byName.get(normalizeCraftName(candidate));
				if (matches && matches.length > 0) {
					return matches[0];
				}
			}

			return undefined;
		},
		[byType, byName],
	);

	const tree = useMemo(() => {
		const rootPath = new Set<string>([item.key]);

		const buildPartNode = (
			part: CollectionPart,
			id: string,
			depth: number,
			path: Set<string>,
		): CraftingTreeNode => {
			const nestedRequirements = part.requirements;
			if (nestedRequirements && nestedRequirements.length > 0 && depth < MAX_DEPTH) {
				return {
					id,
					name: part.name,
					imageUrl: part.imageUrl,
					count: part.count,
					owned: part.owned,
					hasRecipe: part.hasRecipe,
					isCraftable: true,
					children: [
						...nestedRequirements.map((childPart, index) =>
							buildPartNode(
								childPart,
								`${id}-${index}-${childPart.name}`,
								depth + 1,
								path,
							),
						),
					],
				};
			}

			const resolved =
				depth < MAX_DEPTH ? resolveCraftableItem(part) : undefined;
			const canExpand = resolved && !path.has(resolved.key);
			const nextPath = new Set(path);
			if (resolved) {
				nextPath.add(resolved.key);
			}

			return {
				id,
				name: part.name,
				imageUrl: part.imageUrl,
				count: part.count,
				owned: part.owned,
				hasRecipe: part.hasRecipe,
				isCraftable: Boolean(resolved),
				children:
					canExpand && resolved
						? resolved.parts.map((childPart, index) =>
								buildPartNode(
									childPart,
									`${id}-${index}-${childPart.name}`,
									depth + 1,
									nextPath,
								),
							)
						: [],
			};
		};

		return {
			id: item.key,
			name: item.displayName,
			imageUrl: item.imageUrl,
			owned: item.owned,
			isCraftable: true,
			children: item.parts.map((part, index) =>
				buildPartNode(part, `${item.key}-${index}-${part.name}`, 1, rootPath),
			),
		} satisfies CraftingTreeNode;
	}, [item, resolveCraftableItem]);

	const layout = useMemo(() => buildTreeLayout(tree), [tree]);

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

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) {
			return;
		}

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			event.stopPropagation();

			const rect = viewport.getBoundingClientRect();
			const pointX = event.clientX - rect.left;
			const pointY = event.clientY - rect.top;

			const currentScale = scaleRef.current;
			const currentOffset = offsetRef.current;
			const worldX = (pointX - currentOffset.x) / currentScale;
			const worldY = (pointY - currentOffset.y) / currentScale;
			const nextScale = clamp(
				currentScale * (event.deltaY > 0 ? 0.92 : 1.08),
				0.45,
				2.4,
			);

			setScale(nextScale);
			setOffset({
				x: pointX - worldX * nextScale,
				y: pointY - worldY * nextScale,
			});
		};

		viewport.addEventListener("wheel", onWheel, { passive: false });

		return () => {
			viewport.removeEventListener("wheel", onWheel);
		};
	}, []);

	useEffect(() => {
		const lockBackgroundWheel = (event: WheelEvent) => {
			const viewport = viewportRef.current;
			if (!viewport) {
				return;
			}

			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (!viewport.contains(target)) {
				event.preventDefault();
				event.stopPropagation();
			}
		};

		document.addEventListener("wheel", lockBackgroundWheel, {
			capture: true,
			passive: false,
		});

		return () => {
			document.removeEventListener("wheel", lockBackgroundWheel, true);
		};
	}, []);

	const modalContent = (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-label="Crafting tree"
		>
			<button
				type="button"
				aria-label="Close crafting tree"
				className="absolute inset-0 bg-black/70"
				onClick={onClose}
			/>
			<div className="relative w-full max-w-[96vw] h-[92vh] overflow-hidden rounded-xl border bg-background shadow-2xl">
				<div className="flex items-center justify-between px-4 py-3 border-b">
					<div>
						<h2 className="text-lg font-semibold">Crafting Tree</h2>
						<p className="text-sm text-muted-foreground">{item.displayName}</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setScale((prev) => clamp(prev - 0.1, 0.45, 2.4))}
						>
							-
						</Button>
						<span className="text-sm text-center w-14 text-muted-foreground">
							{Math.round(scale * 100)}%
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setScale((prev) => clamp(prev + 0.1, 0.45, 2.4))}
						>
							+
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								setScale(1);
								setOffset({ x: 40, y: 40 });
							}}
						>
							Reset
						</Button>
						<Button type="button" variant="outline" size="sm" onClick={onClose}>
							Close
						</Button>
					</div>
				</div>

				<div
					ref={viewportRef}
					className="relative h-[calc(92vh-58px)] overflow-hidden bg-muted/25 cursor-grab active:cursor-grabbing"
					role="application"
					onKeyDown={(event) => {
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setOffset((previous) => ({ ...previous, y: previous.y + 24 }));
						}
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setOffset((previous) => ({ ...previous, y: previous.y - 24 }));
						}
						if (event.key === "ArrowLeft") {
							event.preventDefault();
							setOffset((previous) => ({ ...previous, x: previous.x + 24 }));
						}
						if (event.key === "ArrowRight") {
							event.preventDefault();
							setOffset((previous) => ({ ...previous, x: previous.x - 24 }));
						}
						if (event.key === "+" || event.key === "=") {
							event.preventDefault();
							setScale((previous) => clamp(previous + 0.08, 0.45, 2.4));
						}
						if (event.key === "-") {
							event.preventDefault();
							setScale((previous) => clamp(previous - 0.08, 0.45, 2.4));
						}
					}}
					onMouseDown={(event) => {
						dragRef.current = {
							startX: event.clientX,
							startY: event.clientY,
							originX: offset.x,
							originY: offset.y,
						};
					}}
					onMouseMove={(event) => {
						if (!dragRef.current) {
							return;
						}

						setOffset({
							x:
								dragRef.current.originX +
								(event.clientX - dragRef.current.startX),
							y:
								dragRef.current.originY +
								(event.clientY - dragRef.current.startY),
						});
					}}
					onMouseUp={() => {
						dragRef.current = null;
					}}
					onMouseLeave={() => {
						dragRef.current = null;
					}}
				>
					<div
						className="absolute top-0 left-0"
						style={{
							width: layout.width,
							height: layout.height,
							transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
							transformOrigin: "top left",
						}}
					>
						<svg
							width={layout.width}
							height={layout.height}
							className="absolute top-0 left-0 pointer-events-none"
						>
							<title>Crafting dependency connectors</title>
							{layout.edges.map((edge) => {
								const from = layout.nodes.find((node) => node.id === edge.from);
								const to = layout.nodes.find((node) => node.id === edge.to);
								if (!from || !to) {
									return null;
								}

								const x1 = from.x;
								const y1 = from.y + NODE_HEIGHT;
								const x2 = to.x;
								const y2 = to.y;
								const midY = y1 + (y2 - y1) * 0.55;

								return (
									<path
										key={`${edge.from}-${edge.to}`}
										d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
										stroke="currentColor"
										strokeWidth="2"
										className="text-border"
										fill="none"
									/>
								);
							})}
						</svg>

						{layout.nodes.map((node) => (
							<div
								key={node.id}
								className={`absolute rounded-lg border shadow-sm ${getNodeStateClass(node)}`}
								style={{
									left: node.x - NODE_WIDTH / 2,
									top: node.y,
									width: NODE_WIDTH,
									height: NODE_HEIGHT,
								}}
							>
								<div className="flex items-center h-full gap-2 p-2">
									<img
										src={node.imageUrl}
										alt={node.name}
										className="object-cover w-12 h-12 rounded shrink-0"
									/>
									<div className="min-w-0">
										<p className="text-sm font-medium truncate">{node.name}</p>
										<p className="text-xs text-muted-foreground">
											{node.count ? `x${node.count} • ` : ""}
											{getNodeStatus(node)}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
}
