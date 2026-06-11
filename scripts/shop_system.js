import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { EconomyConfig } from "./economy_config.js";
import { formatRupiah, getUiHeader, getScore, setScore } from "./utils.js";
import { getPlayerRank } from "./rank_system.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";
import { trackQuestProgress } from "./quest_system.js";

export function formatItemName(id) {
    const name = id.replace("minecraft:", "").replace(/_/g, " ");
    return name.replace(/\b\w/g, l => l.toUpperCase());
}

export function getIconPath(id) {
    const cleanName = id.replace("minecraft:", "");

    // Explicit manual overrides for items that break the heuristic (shows purple/black missing texture in UI)
    const iconOverrides = {
        "slime": "textures/items/slimeball",
        "piston": "textures/blocks/piston_top_normal",
        "sticky_piston": "textures/blocks/piston_top_sticky",
        "hopper": "textures/items/hopper",
        "dispenser": "textures/blocks/dispenser_front_horizontal",
        "dropper": "textures/blocks/dropper_front_horizontal",
        "observer": "textures/blocks/observer_front",
        "comparator": "textures/items/comparator",
        "repeater": "textures/items/repeater",
        "daylight_detector": "textures/blocks/daylight_detector_top",
        "target": "textures/blocks/target_top",
        "lightning_rod": "textures/blocks/lightning_rod",
        "redstone_lamp": "textures/blocks/redstone_lamp_off",
        "tripwire_hook": "textures/blocks/trip_wire_source",
        "jukebox": "textures/blocks/jukebox_top",
        "note_block": "textures/blocks/noteblock",
        "shroomlight": "textures/blocks/shroomlight",
        "end_rod": "textures/blocks/end_rod",
        "campfire": "textures/items/campfire",
        "soul_campfire": "textures/items/soul_campfire",
        "bell": "textures/items/bell",
        "barrel": "textures/blocks/barrel_side",
        "composter": "textures/blocks/composter_side",
        "loom": "textures/blocks/loom_front",
        "stonecutter": "textures/blocks/stonecutter_side",
        "grindstone": "textures/blocks/grindstone_side",
        "smithing_table": "textures/blocks/smithing_table_front",
        "cartography_table": "textures/blocks/cartography_table_side2",
        "fletching_table": "textures/blocks/fletching_table_front",
        "cauldron": "textures/items/cauldron",
        "oak_sapling": "textures/blocks/sapling_oak",
        "spruce_sapling": "textures/blocks/sapling_spruce",
        "birch_sapling": "textures/blocks/sapling_birch",
        "jungle_sapling": "textures/blocks/sapling_jungle",
        "acacia_sapling": "textures/blocks/sapling_acacia",
        "dark_oak_sapling": "textures/blocks/sapling_roofed_oak",
        "wheat_seeds": "textures/items/seeds_wheat",
        "pumpkin_seeds": "textures/items/seeds_pumpkin",
        "melon_seeds": "textures/items/seeds_melon",
        "beetroot_seeds": "textures/items/seeds_beetroot",
        "sugar_cane": "textures/items/reeds",
        "kelp": "textures/items/kelp",
        "iron_ingot": "textures/items/iron_ingot",
        "gold_ingot": "textures/items/gold_ingot",
        "copper_ingot": "textures/items/copper_ingot",
        "raw_iron": "textures/items/raw_iron",
        "raw_gold": "textures/items/raw_gold",
        "raw_copper": "textures/items/raw_copper"
    };

    if (iconOverrides[cleanName]) {
        return iconOverrides[cleanName];
    }

    // Simplistic heuristic for standard Bedrock vanilla paths
    if (cleanName.includes("log") || cleanName.includes("dirt") || cleanName.includes("sand") || cleanName.includes("stone") || cleanName.includes("block") || cleanName.includes("obsidian") || cleanName.includes("glass") || cleanName.includes("basalt") || cleanName.includes("ice") || cleanName.includes("ore") || cleanName.includes("planks")) {
        return `textures/blocks/${cleanName}`;
    }
    return `textures/items/${cleanName}`;
}

// Modern Shop Categories
export const SHOP_CATEGORIES = [
    {
        name: "Pertanian & Makanan",
        icon: "textures/items/bread",
        keywords: ["bread", "beef", "porkchop", "mutton", "chicken", "rabbit", "cod", "salmon", "apple", "carrot", "pie", "stew", "sapling", "propagule", "seeds", "potato", "wheat", "sugar_cane", "bamboo", "berries", "kelp", "cocoa", "cactus"]
    },
    {
        name: "Blok Alam & Material",
        icon: "textures/blocks/stone",
        keywords: ["log", "cobblestone", "stone", "granite", "diorite", "andesite", "calcite", "tuff", "deepslate", "dirt", "sand", "gravel", "glass", "obsidian", "glowstone", "lantern", "prismarine", "bricks", "netherrack", "soul_", "magma", "basalt", "blackstone", "end_stone", "purpur"]
    },
    {
        name: "Mineral & Ingot",
        icon: "textures/items/diamond",
        keywords: ["coal", "iron_ingot", "gold_ingot", "copper_ingot", "redstone", "lapis", "diamond", "emerald", "quartz", "amethyst", "raw_iron", "raw_gold", "raw_copper"]
    },
    {
        name: "Redstone & Mekanik",
        icon: "textures/items/redstone_dust",
        keywords: ["slime", "piston", "hopper", "dispenser", "observer", "dropper", "comparator", "repeater", "detector", "target", "lightning_rod", "lamp", "tripwire"]
    },
    {
        name: "Mob Drops & Loot",
        icon: "textures/items/slimeball",
        keywords: ["string", "leather", "feather", "flesh", "bone", "spider", "gunpowder", "magma_cream", "tear", "pearl", "blaze", "membrane", "shulker", "honey", "scute", "nautilus"]
    },
    {
        name: "Peralatan & Dekorasi",
        icon: "textures/items/bed_red",
        keywords: ["torch", "chest", "anvil", "enchanting", "brewing", "bookshelf", "bed", "scaffolding", "jukebox", "note_block", "shroomlight", "end_rod", "campfire", "bell", "barrel", "composter", "loom", "stonecutter", "grindstone", "smithing", "cartography", "fletching", "cauldron", "arrow", "bow", "crossbow", "shield", "bottle", "name_tag", "saddle", "lead", "clock", "compass", "spyglass", "bucket"]
    },
    {
        name: "Bibit & Makhluk",
        icon: "textures/items/egg",
        keywords: ["spawn_egg"]
    }
];

export function openBuyMenu(player) {
    const form = new ActionFormData();
    form.title("§1Katalog Perdagangan");
    form.body(`${getUiHeader(player)}\n§7Pilih kategori komoditas yang tersedia di pasar.`);

    for (const cat of SHOP_CATEGORIES) {
        form.button(`§l${cat.name}`);
    }
    form.button("§d§lArtefak Kuno\n§r§7Koleksi benda langka (Premium)");
    form.button("§cKembali ke Sektor Ekonomi");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection < SHOP_CATEGORIES.length) {
            openCategoryItemsMenu(player, SHOP_CATEGORIES[res.selection].name, SHOP_CATEGORIES[res.selection].keywords, false, 0);
        } else if (res.selection === SHOP_CATEGORIES.length) {
            // OP Items Tab (Special Case)
            openCategoryItemsMenu(player, "Artefak Kuno", [], true, 0);
        } else {
            system.runTimeout(() => { import("./menu_system.js").then(mod => mod.openEconomyMenu(player)); }, 5);
        }
    });
}

export function openCategoryItemsMenu(player, categoryName, keywords, isOPCategory, page) {
    let categoryItems = [];

    if (isOPCategory) {
        const opKeys = Object.keys(EconomyConfig.buyPoolOP);
        for (const key of opKeys) {
            categoryItems.push({ id: key, price: EconomyConfig.buyPoolOP[key], isOP: true });
        }
    } else {
        const normalKeys = Object.keys(EconomyConfig.buyPoolNormal);
        for (const key of normalKeys) {
            // Check if key matches any of the category keywords
            const isMatch = keywords.some(k => key.includes(k));
            if (isMatch) {
                // Ensure iron_block etc doesn't get swept into minerals unexpectedly unless targeted, but generic matching is fine for now
                categoryItems.push({ id: key, price: EconomyConfig.buyPoolNormal[key], isOP: false });
            }
        }
    }

    if (categoryItems.length === 0) {
        player.sendMessage("§c[Shop] Kategori ini sedang kosong.");
        openBuyMenu(player);
        return;
    }

    const itemsPerPage = 12; // Increased density for modern feel
    const totalPages = Math.ceil(categoryItems.length / itemsPerPage);
    const startIdx = page * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, categoryItems.length);
    const pageItems = categoryItems.slice(startIdx, endIdx);

    const form = new ActionFormData();
    form.title(`§1${categoryName} | Hal ${page + 1}/${totalPages}`);
    form.body(`${getUiHeader(player)}`);

    for (const item of pageItems) {
        const displayName = formatItemName(item.id);
        const priceStr = formatRupiah(item.price);

        if (item.isOP) {
            form.button(`§d§l[OP] ${displayName}§r\n§e${priceStr}`);
        } else {
            form.button(`§f${displayName}\n§e${priceStr}`);
        }
    }

    // Pagination Controls
    if (page > 0) form.button("§e<- Halaman Sebelumnya");
    if (page < totalPages - 1) form.button("§eHalaman Selanjutnya ->");
    form.button("§cKembali ke Kategori");

    form.show(player).then((response) => {
        if (response.canceled) return;

        let selection = response.selection;

        // Item clicked
        if (selection < pageItems.length) {
            openBuyAmountMenu(player, pageItems[selection]);
            return;
        }

        selection -= pageItems.length;

        if (page > 0 && selection === 0) {
            openCategoryItemsMenu(player, categoryName, keywords, isOPCategory, page - 1);
            return;
        }

        if (page > 0) selection -= 1;

        if (page < totalPages - 1 && selection === 0) {
            openCategoryItemsMenu(player, categoryName, keywords, isOPCategory, page + 1);
            return;
        }

        // Back to Categories button
        openBuyMenu(player);
    });
}

export function openBuyAmountMenu(player, itemData) {
    const form = new ModalFormData();
    const displayName = formatItemName(itemData.id);

    const pRank = getPlayerRank(player);
    const rawPrice = itemData.price;
    const discount = (pRank && typeof pRank.discount === 'number') ? pRank.discount : 0;
    const rankBadge = (pRank && pRank.badge) ? pRank.badge : "§7[Warga]";
    const discountedPrice = Math.floor(rawPrice * (1 - discount));

    let priceText = `§7Harga Normal: §c${formatRupiah(rawPrice)}§r\n`;
    if (discount > 0) {
        priceText += `§7Diskon Pangkat (${rankBadge}§7): §a${formatRupiah(discountedPrice)}§r\n`;
    }

    form.title("§aBeli Barang");
    form.slider(`Tentukan jumlah §e${displayName} §fyang ingin dibeli:\n\n${priceText}`, 1, 64, 1, 1);

    form.show(player).then((response) => {
        if (response.canceled) return;

        const amount = Math.floor(response.formValues[0]);
        const finalCost = discountedPrice * amount;
        const currentCoins = getScore(player, "dompet");

        if (currentCoins >= finalCost) {
            const invComponent = player.getComponent("inventory");
            if (!invComponent || !invComponent.container) {
                player.sendMessage("§c[Shop] Gagal mengakses Inventory Anda!");
                return;
            }

            const maxStackSize = new ItemStack(itemData.id, 1).maxAmount;
            const slotsNeeded = Math.ceil(amount / maxStackSize);

            // Hard check to prevent dropping items as entities and lagging the server
            if (invComponent.container.emptySlotsCount < slotsNeeded) {
                player.sendMessage(`§c[Shop] Inventory Anda tidak memiliki cukup ruang! Diperlukan ${slotsNeeded} slot kosong.`);
                return;
            }

            setScore(player, "dompet", currentCoins - finalCost);

            let remaining = amount;
            while (remaining > 0) {
                let toGive = Math.min(remaining, maxStackSize);
                let stackToGive = new ItemStack(itemData.id, toGive);

                try {
                    invComponent.container.addItem(stackToGive);
                } catch(e) {}
                remaining -= toGive;
            }

            player.sendMessage(`§a[Shop] Berhasil membeli §e${amount}x ${displayName} §aseharga §e${formatRupiah(finalCost)}!`);
            trackStat(player, "itemsBought", 1);
            trackStat(player, "moneySpent", finalCost);
            unlockAchievement(player, "first_buy");
        } else {
            player.sendMessage(`§c[Shop] Saldo Rupiah Anda tidak mencukupi. Diperlukan ${formatRupiah(finalCost)}.`);
        }
    });
}

export function processSellAll(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    let totalEarned = 0;
    let itemsSold = false;
    let merchantFortuneActive = false;

    // Check event once before loop
    try {
        const evtData = world.getDynamicProperty("active_event");
        if (evtData && typeof evtData === 'string') {
            const evt = JSON.parse(evtData);
            if (evt.id === "merchant_fortune" && (evt.duration === 0 || Date.now() < evt.endTime)) {
                merchantFortuneActive = true;
            }
        }
    } catch(e) {}

    // Scan only main inventory (slots 0-35)
    for (let i = 0; i < 36; i++) {
        const item = inventory.getItem(i);
        if (!item) continue;

        // Ignore the Menu Utama clock and Guide Book
        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

        const typeId = item.typeId;
        const basePrice = EconomyConfig.sellPrices[typeId];
        let sellPrice = basePrice !== undefined ? basePrice : 5; // 5 Rupiah fallback for all other items

        // Event: Keberuntungan Pedagang -- Double sell prices
        if (merchantFortuneActive) sellPrice *= 2;

        // Sell everything except clock/book
        const amount = item.amount;
        const itemValue = sellPrice * amount;
        totalEarned += itemValue;

        // Remove the item completely
        inventory.setItem(i, undefined);
        itemsSold = true;
    }

    if (itemsSold) {
        const currentCoins = getScore(player, "dompet");
        setScore(player, "dompet", currentCoins + totalEarned);
        player.sendMessage(`§a[Shop] Berhasil menjual barang! Total didapat: §e${formatRupiah(totalEarned)}${merchantFortuneActive ? " §a(2x Keberuntungan Pedagang!)" : ""}`);
        trackStat(player, "itemsSold", 1);
        trackStat(player, "moneyEarned", totalEarned);
        trackQuestProgress(player, "sell_items", 1);
        trackQuestProgress(player, "earn_rupiah", totalEarned);
        unlockAchievement(player, "first_sell");
    } else {
        player.sendMessage("§c[Shop] Tidak ada barang yang dapat dijual di dalam Inventory.");
    }
}

export function openSellChoiceMenu(player) {
    const form = new ActionFormData();
    form.title("§1Jual Barang");
    form.body(`${getUiHeader(player)}\n§7Pilih metode penjualan barang Anda.`);
    form.button("§aJual Semua (Auto-Scan)\n§7Otomatis jual semua barang");
    form.button("§ePilih Manual (Manual-Scan)\n§7Pilih barang yang ingin dijual");
    form.button("§cKembali ke Sektor Ekonomi");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) {
            processSellAll(player);
        } else if (res.selection === 1) {
            openManualSellMenu(player);
        } else if (res.selection === 2) {
            system.runTimeout(() => { import("./menu_system.js").then(mod => mod.openEconomyMenu(player)); }, 5);
        }
    });
}

export function openManualSellMenu(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    // Aggregate sellable items from main inventory (0-35)
    // We group them by typeId to make the UI cleaner
    const sellableMap = new Map(); // typeId -> { amount, price }

    for (let i = 0; i < 36; i++) {
        const item = inventory.getItem(i);
        if (!item) continue;

        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

        const base = EconomyConfig.sellPrices[item.typeId];
        let pricePerUnit = base !== undefined ? base : 5;

        // Event: Keberuntungan Pedagang -- Double sell prices
        let merchantFortune = false;
        try {
            const evtData = world.getDynamicProperty("active_event");
            if (evtData && typeof evtData === 'string') {
                const evt = JSON.parse(evtData);
                if (evt.id === "merchant_fortune" && (evt.duration === 0 || Date.now() < evt.endTime)) {
                    pricePerUnit *= 2;
                    merchantFortune = true;
                }
            }
        } catch(e) {}

        const existing = sellableMap.get(item.typeId);
        if (existing) {
            existing.amount += item.amount;
            if (merchantFortune) existing.price = pricePerUnit; // update price if doubled
        } else {
            sellableMap.set(item.typeId, { amount: item.amount, price: pricePerUnit });
        }
    }

    if (sellableMap.size === 0) {
        player.sendMessage("§c[Shop] Tidak ada barang yang dapat dijual di dalam Inventory.");
        return;
    }

    const form = new ModalFormData();
    form.title("§1Jual Manual");

    // Convert map to array for predictable iteration
    const sellableList = Array.from(sellableMap.entries()).map(([typeId, data]) => {
        return { typeId, totalAmount: data.amount, price: data.price };
    });

    for (const data of sellableList) {
        const displayName = formatItemName(data.typeId);
        form.slider(`Jual §e${displayName} §f(Maks: ${data.totalAmount})\n§7Harga Satuan: ${formatRupiah(data.price)}`, 0, data.totalAmount, 1, 0);
    }

    form.show(player).then(res => {
        if (res.canceled) return;

        let totalEarned = 0;
        let itemsSold = false;

        // Process deduction
        for (let i = 0; i < sellableList.length; i++) {
            const amountToSell = Math.floor(res.formValues[i]);
            if (amountToSell > 0) {
                const data = sellableList[i];
                totalEarned += (amountToSell * data.price);
                itemsSold = true;

                // Deduct exactly 'amountToSell' from the inventory
                let remainingToRemove = amountToSell;
                for (let slot = 0; slot < 36; slot++) {
                    if (remainingToRemove <= 0) break;

                    const item = inventory.getItem(slot);
                    if (item && item.typeId === data.typeId) {
                        // Ensure we don't accidentally remove the Menu Utama if it shares an ID (unlikely, but safe)
                        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
                        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

                        if (item.amount <= remainingToRemove) {
                            remainingToRemove -= item.amount;
                            inventory.setItem(slot, undefined); // clear slot
                        } else {
                            item.amount -= remainingToRemove;
                            inventory.setItem(slot, item);
                            remainingToRemove = 0;
                        }
                    }
                }
            }
        }

        if (itemsSold) {
            const currentCoins = getScore(player, "dompet");
            setScore(player, "dompet", currentCoins + totalEarned);
            player.sendMessage(`§a[Shop] Berhasil menjual barang pilihan! Total didapat: §e${formatRupiah(totalEarned)}`);
            trackStat(player, "itemsSold", 1);
            trackStat(player, "moneyEarned", totalEarned);
            trackQuestProgress(player, "sell_items", 1);
            trackQuestProgress(player, "earn_rupiah", totalEarned);
            unlockAchievement(player, "first_sell");
        } else {
            player.sendMessage("§e[Shop] Anda membatalkan penjualan (0 item dipilih).");
        }
    });
}
