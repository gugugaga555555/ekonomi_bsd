import { world, system, ItemStack, GameMode, ItemLockMode } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore, sendToInbox } from "./utils.js";
import { EconomyConfig } from "./economy_config.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

const CHEST_PRICE = 1000000;
const DB_KEY = "autosell_chests";
const MAX_CHESTS_PER_PLAYER = 3; // Limit peti per pemain untuk mencegah lag server

// Load database
function getDb() {
    try {
        const raw = world.getDynamicProperty(DB_KEY);
        if (raw && typeof raw === 'string') {
            return JSON.parse(raw);
        }
    } catch(e) {}
    return [];
}

function saveDb(data) {
    world.setDynamicProperty(DB_KEY, JSON.stringify(data));
}

// Helper: hitung jumlah peti auto-sell milik pemain
function countPlayerChests(playerName) {
    const db = getDb();
    return db.filter(c => c.owner === playerName).length;
}

// UI Menu
export function openAutoSellMenu(player) {
    const form = new ActionFormData();
    form.title("§1Sistem Ekspor Otomatis");
    const ownedCount = countPlayerChests(player.name);
    const limitText = ownedCount >= MAX_CHESTS_PER_PLAYER 
        ? `\n§cAnda sudah mencapai batas maksimal (${MAX_CHESTS_PER_PLAYER} peti)!` 
        : `\n§7Kepemilikan: §e${ownedCount}/${MAX_CHESTS_PER_PLAYER}§7 peti`;
    form.body(`Peti ajaib ini akan mengekspor barang yang masuk ke dalamnya secara otomatis dan mencairkan dananya ke Kas Anda, meskipun Anda sedang tidak berada di server!\n\n§eBiaya Pembuatan: ${formatRupiah(CHEST_PRICE)}${limitText}`);
    form.button("§aBeli Peti Ekspor\n§7Rp 1 Juta");
    form.button("§cKembali ke Sektor Ekonomi");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) {
            buyAutoSellChest(player);
        } else {
            system.runTimeout(() => { import("./menu_system.js").then(mod => mod.openEconomyMenu(player)); }, 5);
        }
    });
}

function buyAutoSellChest(player) {
    // Cek limit peti per pemain
    const currentCount = countPlayerChests(player.name);
    if (currentCount >= MAX_CHESTS_PER_PLAYER) {
        player.sendMessage(`§c[Sistem] Anda sudah memiliki §e${currentCount}§c Peti Ekspor! Batas maksimal adalah §e${MAX_CHESTS_PER_PLAYER}§c peti per pemain.`);
        return;
    }

    const currentCoins = getScore(player, "dompet");
    if (currentCoins < CHEST_PRICE) {
        player.sendMessage(`§c[Shop] Rupiah tidak cukup! Butuh ${formatRupiah(CHEST_PRICE)}`);
        return;
    }

    const inventory = player.getComponent("inventory").container;
    if (inventory.emptySlotsCount === 0) {
        player.sendMessage("§c[Shop] Inventory Anda penuh! Kosongkan slot terlebih dahulu.");
        return;
    }

    setScore(player, "dompet", currentCoins - CHEST_PRICE);

    const chestItem = new ItemStack("minecraft:chest", 1);
    chestItem.nameTag = "§a§lPeti Ekspor (Auto-Sell)";

    inventory.addItem(chestItem);
    player.sendMessage(`§a[Sistem] Berhasil membuat Peti Ekspor! (${currentCount + 1}/${MAX_CHESTS_PER_PLAYER}) Silakan taruh di markas dan sambungkan dengan Corong (Hopper).`);
    unlockAchievement(player, "first_autosell");
}

// Detect placing the custom chest
world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const player = event.player;
    const block = event.block;

    // We need to check if the player held the custom item right after placing.
    // Minecraft API doesn't easily expose the exact item used to place in afterEvents directly unless we check inventory or assume from hand.
    // However, beforeEvents.itemUseOn is more reliable for custom block items.
});

// Since playerPlaceBlock doesn't easily give the nameTag of the item used, we'll use itemUseOn to intercept.
world.beforeEvents.itemUseOn.subscribe((event) => {
    const item = event.itemStack;
    // Check both old and new name tags for backwards compatibility
    if (item && item.typeId === "minecraft:chest" && (item.nameTag === "§a§lPeti Ekspor (Auto-Sell)" || item.nameTag === "§a§lChest Auto-Sell")) {
        const player = event.source;
        const block = event.block;
        const face = event.blockFace;

        // Calculate placement position
        let x = block.x;
        let y = block.y;
        let z = block.z;

        if (face === "Up") y++;
        else if (face === "Down") y--;
        else if (face === "North") z--;
        else if (face === "South") z++;
        else if (face === "West") x--;
        else if (face === "East") x++;

        const dim = player.dimension;
        const targetBlock = dim.getBlock({x,y,z});

        if (!targetBlock || (!targetBlock.isAir && !targetBlock.isLiquid)) {
           return;
        }

        // Cancel default placement to handle it manually
        event.cancel = true;

        system.run(() => {
            // Cek limit peti sebelum menaruh
            const ownedCount = countPlayerChests(player.name);
            if (ownedCount >= MAX_CHESTS_PER_PLAYER) {
                player.sendMessage(`§c[Sistem] Anda sudah memiliki §e${ownedCount}§c Peti Ekspor! Batas maksimal adalah §e${MAX_CHESTS_PER_PLAYER}§c peti. Peti ini tidak dipasang.`);
                return;
            }

            // Remove item from inventory (1 count)
            if (player.getGameMode() !== GameMode.creative) {
                const eq = player.getComponent("equippable");
                if (eq) {
                   const mainhand = eq.getEquipment("Mainhand");
                   if (mainhand && mainhand.typeId === "minecraft:chest" && (mainhand.nameTag === "§a§lPeti Ekspor (Auto-Sell)" || mainhand.nameTag === "§a§lChest Auto-Sell")) {
                       if (mainhand.amount > 1) {
                           mainhand.amount--;
                           eq.setEquipment("Mainhand", mainhand);
                       } else {
                           eq.setEquipment("Mainhand", undefined);
                       }
                   }
                }
            }

            // Set block to chest
            targetBlock.setType("minecraft:chest");

            // Create a ticking area to keep the farm running 24/7
            const taName = `autosell_${x}_${y}_${z}`;
            dim.runCommandAsync(`tickingarea add circle ${x} ${y} ${z} 1 "${taName}"`).catch(() => {});

            // Save to DB
            const db = getDb();
            db.push({
                x, y, z,
                dim: dim.id,
                owner: player.name,
                taName: taName
            });
            saveDb(db);

            player.sendMessage("§a[Sistem] Peti Ekspor terpasang! Area industri ini sekarang aktif beroperasi 24 jam penuh tanpa perlu diawasi!");
        });
    }
});

// Detect breaking the chest
world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const block = event.block;
    if (block.typeId === "minecraft:chest") {
        const dimId = event.dimension.id;
        let db = getDb();
        const index = db.findIndex(c => c.x === block.x && c.y === block.y && c.z === block.z && c.dim === dimId);

        if (index !== -1) {
            // It is an Auto-Sell chest
            event.cancel = true;
            const player = event.player;

            system.run(() => {
                // Reload DB inside run to prevent race conditions
                let currentDb = getDb();
                const currentIndex = currentDb.findIndex(c => c.x === block.x && c.y === block.y && c.z === block.z && c.dim === dimId);
                if (currentIndex !== -1) {
                    const chestData = currentDb[currentIndex];
                    if (chestData.taName) {
                        event.dimension.runCommandAsync(`tickingarea remove "${chestData.taName}"`).catch(() => {});
                    }
                    currentDb.splice(currentIndex, 1);
                    saveDb(currentDb);
                }
                const inv = block.getComponent("inventory");
                if (inv && inv.container) {
                    for (let i = 0; i < inv.container.size; i++) {
                        const item = inv.container.getItem(i);
                        if (item) {
                            event.dimension.spawnItem(item, block.center());
                            inv.container.setItem(i, undefined);
                        }
                    }
                }
                block.setType("minecraft:air");

                // Drop custom item
                const drop = new ItemStack("minecraft:chest", 1);
                drop.nameTag = "§a§lPeti Ekspor (Auto-Sell)";
                event.dimension.spawnItem(drop, block.center());

                player.sendMessage("§c[Sistem] Peti Ekspor berhasil dibongkar.");
            });
        }
    }
});

// Processing Loop
system.runInterval(() => {
    let db = getDb();
    if (db.length === 0) return;

    const allPlayers = world.getAllPlayers();
    // Fixed: Kumpulkan index yang perlu dihapus, lalu hapus dari belakang
    // untuk menghindari skip entry saat splice selama iterasi
    const indicesToRemove = [];

    for (let idx = 0; idx < db.length; idx++) {
        const chest = db[idx];
        try {
            const dim = world.getDimension(chest.dim);
            const block = dim.getBlock({x: chest.x, y: chest.y, z: chest.z});

            // If block is unloaded, getBlock might return undefined or error, we just catch and continue
            if (!block) continue;

            // Verify it's still a chest (maybe destroyed by creeper)
            if (block.typeId !== "minecraft:chest") {
                // Chest was destroyed by something other than a player. Remove from DB to prevent memory leak.
                if (chest.taName) {
                    dim.runCommandAsync(`tickingarea remove "${chest.taName}"`).catch(() => {});
                }
                indicesToRemove.push(idx);
                continue;
            }

            const inv = block.getComponent("inventory");
            if (!inv || !inv.container) continue;

            let totalEarned = 0;
            const container = inv.container;

            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (!item) continue;

                // Do not sell the config items themselves by accident, though highly unlikely inside a farm chest
                if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;

                const typeId = item.typeId;
                const basePrice = EconomyConfig.sellPrices[typeId];
                let sellPrice = basePrice !== undefined ? basePrice : 5;

                // Event: Keberuntungan Pedagang -- Double sell prices
                try {
                    const evtData = world.getDynamicProperty("active_event");
                    if (evtData && typeof evtData === 'string') {
                        const evt = JSON.parse(evtData);
                        if (evt.id === "merchant_fortune" && (evt.duration === 0 || Date.now() < evt.endTime)) {
                            sellPrice *= 2;
                        }
                    }
                } catch(e) {}

                const amount = item.amount;
                totalEarned += (sellPrice * amount);

                // Remove item
                container.setItem(i, undefined);
            }

            if (totalEarned > 0) {
                // To avoid duplicate scoreboard entries in Top Sultan for offline players,
                // we first check if the player is currently online.
                const ownerPlayer = allPlayers.find(p => p.name === chest.owner);

                if (ownerPlayer) {
                    // Player is online, safely add to their dompet score directly
                    const currentCoins = getScore(ownerPlayer, "dompet");
                    setScore(ownerPlayer, "dompet", currentCoins + totalEarned);
                } else {
                    // Player is offline, send the earnings to their Inbox.
                    // This prevents dummy string entries in the scoreboard that break the Top Sultan logic.
                    sendToInbox(chest.owner, "Auto-Sell", totalEarned, "Penjualan dari mesin otomatis Anda.");
                }
            }
        } catch(e) {
            // Chunk probably unloaded, ignore
        }
    }

    // Hapus entry yang invalid dari belakang (reverse order) agar index tidak bergeser
    if (indicesToRemove.length > 0) {
        for (let i = indicesToRemove.length - 1; i >= 0; i--) {
            db.splice(indicesToRemove[i], 1);
        }
        saveDb(db);
    }
}, 100); // 5 seconds (20 ticks/sec)
