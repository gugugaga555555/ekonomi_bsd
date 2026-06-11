import { world, system, ItemStack, ItemLockMode, EnchantmentTypes, DisplaySlotId } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getPlayerRpgData, getXpRequired, generateXpBar, applyPassiveStats, addXp, breakBlockArea, breakTreecapitator, breakCropArea, isCropBlock, canUseActiveSkill, breakColumnArea, breakLeafArea, harvestAndReplantArea } from "./rpg_system.js";
import { formatRupiah, getScore, setScore } from "./utils.js";
import { activeBounties, saveBounties } from "./bounty_system.js";
import { formatItemName } from "./shop_system.js";
import { openMainMenu, openGuideBook } from "./menu_system.js";
import { hiddenBoards } from "./app_state.js";
import { getActiveEvent, isEventActive, getNextEventETA, getActiveEventDisplay } from "./event_system.js";
import { trackQuestProgress } from "./quest_system.js";
import { unlockAchievement, checkWealthAchievements, checkRpgAchievements } from "./achievement_system.js";
import { processLoginReward } from "./login_reward.js";
import { trackStat } from "./stats_system.js";
import { handleArenaPlayerDeath, isPlayerInArena, updateArenaActionbars, handleArenaMobKill } from "./arena_system.js";

// ============================================================
// SCOREBOARD INITIALIZATION
// ============================================================

system.run(() => {
    try {
        let dompetObj = world.scoreboard.getObjective("dompet");
        if (!dompetObj) {
            dompetObj = world.scoreboard.addObjective("dompet", "§e§lPRO SURVIVAL");
        }
        if (!world.scoreboard.getObjective("core")) {
            world.scoreboard.addObjective("core", "§b§lCORE");
        }

        // Clear sidebar if it was previously set
        world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);

        // Clean up legacy dummy players from old Auto-Sell bug
        system.runTimeout(() => {
            try {
                const dompetObj = world.scoreboard.getObjective("dompet");
                if (dompetObj) {
                    const participants = dompetObj.getParticipants();
                    for (const participant of participants) {
                        // If it's a FakePlayer (string entity), remove it to clean the Top Sultan leaderboard
                        if (participant.type !== "Player") {
                            dompetObj.removeParticipant(participant);
                        }
                    }
                }
            } catch (e) {}
        }, 100);

    } catch (e) {
        // Ignore if it already exists or errors
    }
});

// ============================================================
// ACTIONBAR LOOP & PASSIVE STATS
// ============================================================

system.runInterval(() => {

    const players = world.getAllPlayers();
    for (const player of players) {
        // Passive Stats application (runs constantly regardless of actionbar visibility)
        const rpgData = getPlayerRpgData(player);
        applyPassiveStats(player, rpgData);

        // v2.5: Arena actionbar takes priority for arena players
        if (isPlayerInArena(player.name)) continue;

        if (hiddenBoards.get(player.name)) continue;

        let actionbarText = "";
        let eventPrefix = "";

        // Check for active event
        const eventDisplay = getActiveEventDisplay();
        if (eventDisplay) {
            eventPrefix = eventDisplay.text + " §7| ";
        }

        // Check if player earned XP recently (within last 3 seconds)
        try {
            const recentStr = player.getDynamicProperty("rpg_recent_xp");
            if (recentStr && typeof recentStr === 'string') {
                const recent = JSON.parse(recentStr);
                if (Date.now() - recent.time < 3000) {
                    const prof = recent.prof;
                    const lv = rpgData[prof].level;
                    const xp = rpgData[prof].xp;
                    const req = getXpRequired(lv);
                    const pct = req === Infinity ? "MAX" : Math.floor((xp / req) * 100) + "%";
                    const bar = req === Infinity ? "§b||||||||||||||||||||" : generateXpBar(xp, req);
                    const surgeTag = recent.surge ? " §a2x!" : "";
                    actionbarText = `${eventPrefix}§e${prof.toUpperCase()} Lv.${lv} §f[${bar}§f] §a${pct}${surgeTag}`;
                }
            }
        } catch (e) {}

        // If no XP progress, show event or ETA
        if (actionbarText === "") {
            if (eventDisplay) {
                actionbarText = eventDisplay.text;
            } else {
                const eta = getNextEventETA();
                if (eta > 0) {
                    const etaMin = Math.ceil(eta / 60000);
                    actionbarText = `§7Event berikutnya: §e${etaMin}m`;
                }
            }
        }

        if (actionbarText !== "") {
            player.onScreenDisplay.setActionBar(actionbarText);
        } else {
            player.onScreenDisplay.setActionBar("");
        }
    }

    // v2.5: Update arena actionbars
    updateArenaActionbars();
}, 20);

// ============================================================
// CHAT COMMAND SYSTEM (Modern chatSend + Legacy scriptevent)
// ============================================================

// Modern chat command system via chatSend
try {
    world.beforeEvents.chatSend.subscribe((event) => {
        const msg = event.message.trim();
        if (!msg.startsWith("!")) return; // Hanya proses yang pakai prefix !

        const sender = event.sender;
        const args = msg.slice(1).toLowerCase().split(" ");
        const cmd = args[0];

        switch (cmd) {
            case "menu":
                event.cancel = true;
                system.run(() => { openMainMenu(sender); });
                break;
            case "hideboard":
                event.cancel = true;
                hiddenBoards.set(sender.name, true);
                system.run(() => {
                    sender.onScreenDisplay.setActionBar("");
                    sender.sendMessage("§a[System] Actionbar disembunyikan. Ketik §e!showboard§a untuk menampilkan kembali.");
                });
                break;
            case "showboard":
                event.cancel = true;
                hiddenBoards.set(sender.name, false);
                system.run(() => {
                    sender.sendMessage("§a[System] Actionbar ditampilkan.");
                });
                break;
            case "bal":
            case "saldo":
                event.cancel = true;
                system.run(() => {
                    const coins = getScore(sender, "dompet");
                    const core = getScore(sender, "core");
                    sender.sendMessage(`§eSaldo: §f${formatRupiah(coins)} §7| §bCore: §f${core}`);
                });
                break;
            case "help":
                event.cancel = true;
                system.run(() => {
                    sender.sendMessage("§e§l=== Perintah Chat ===§r");
                    sender.sendMessage("§e!menu §7- Buka menu utama (Jam)");
                    sender.sendMessage("§e!hideboard §7- Sembunyikan actionbar");
                    sender.sendMessage("§e!showboard §7- Tampilkan actionbar");
                    sender.sendMessage("§e!saldo §7- Cek saldo Rupiah & Core");
                    sender.sendMessage("§7Tip: Semua fitur juga bisa diakses lewat Jam Menu Utama!");
                    sender.sendMessage("§7Alternatif: /scriptevent ekonomi:hideboard / showboard");
                });
                break;
        }
    });
} catch (e) {
    // chatSend tidak tersedia di versi API lama, fallback ke scriptevent saja
}

// Legacy /scriptevent commands (backward compatibility)
system.afterEvents.scriptEventReceive.subscribe((event) => {
    const id = event.id;
    const player = event.sourceEntity;

    // We only process if it's from a player
    if (!player || player.typeId !== "minecraft:player") return;

    if (id === "ekonomi:hideboard") {
        hiddenBoards.set(player.name, true);
        player.onScreenDisplay.setActionBar(""); // Clear actionbar immediately
        player.sendMessage("§a[System] Actionbar disembunyikan. Ketik /scriptevent ekonomi:showboard untuk menampilkan kembali.");
    } else if (id === "ekonomi:showboard") {
        hiddenBoards.set(player.name, false);
        player.sendMessage("§a[System] Actionbar ditampilkan.");
    }
}, { namespaces: ["ekonomi"] });

// ============================================================
// PLAYER SPAWN -- STARTER PACK & MENU CLOCK
// ============================================================

world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    system.runTimeout(() => {
        // 1. Give Welcome Screen and Starter Pack if New Player
        if (!player.hasTag("has_received_guide")) {
            const form = new ActionFormData();
            form.title("§e§lWelcome to PRO SURVIVAL");
            form.body("§fSelamat datang di server! Server ini memiliki sistem Ekonomi, Gacha, dan RPG yang sangat seru.\n\nAmbil Starter Pack Anda di bawah ini untuk memulai petualangan!");
            form.button("§aAmbil Starter Pack\n§7Rp10.000 + 5 Roti");

            form.show(player).then(res => {
                player.addTag("has_received_guide"); // Prevent looping

                // Give Starter Pack items
                player.runCommandAsync("give @s minecraft:bread 5");
                const currentCoins = getScore(player, "dompet");
                setScore(player, "dompet", currentCoins + 10000);

                player.sendMessage("§a[System] Anda mendapatkan Starter Pack! Selamat bermain!");
                grantMenuClock(player);
            }).catch(e => {
                // If UI closed by accident, just give the items
                player.addTag("has_received_guide");
                player.runCommandAsync("give @s minecraft:bread 5");
                const currentCoins = getScore(player, "dompet");
                setScore(player, "dompet", currentCoins + 10000);
                grantMenuClock(player);
            });
        } else {
            // Returning player, just ensure they have the clock
            grantMenuClock(player);

            // v2.1: Process daily login reward
            processLoginReward(player);
        }
    }, 20);
});

function grantMenuClock(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    let hasShop = false;
    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (item && item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") {
            hasShop = true;
            break;
        }
    }

    if (!hasShop) {
        const clock = new ItemStack("minecraft:clock", 1);
        clock.nameTag = "§e§lMenu Utama";

        if (typeof ItemLockMode !== 'undefined' && ItemLockMode.inventory) {
            clock.lockMode = ItemLockMode.inventory;
        } else {
            clock.lockMode = "inventory";
        }

        try {
            const enchantable = clock.getComponent("enchantable") || clock.getComponent("minecraft:enchantable");
            if (enchantable) {
                const unbreakingType = EnchantmentTypes.get("unbreaking");
                if (unbreakingType) {
                    try {
                        enchantable.addEnchantment({ type: unbreakingType, level: 1 });
                    } catch (e) {
                        // Some versions require the exact Enchantment object
                    }
                }
            }
        } catch (e) {}

        const slot8Item = inventory.getItem(8);
        if (slot8Item) {
            let emptySlot = -1;
            for (let i = 0; i < 36; i++) {
                if (!inventory.getItem(i)) {
                    emptySlot = i;
                    break;
                }
            }

            if (emptySlot !== -1) {
                inventory.setItem(emptySlot, slot8Item);
                inventory.setItem(8, clock);
            } else {
                player.sendMessage("§c[System] Inventory Anda penuh. Gagal memberikan Jam Menu Utama.");
            }
        } else {
            inventory.setItem(8, clock);
        }
    }
}

// ============================================================
// SPAWN EGG -- STEALTH SPAWN FOR SHOP ANIMALS
// ============================================================

world.beforeEvents.itemUseOn.subscribe((event) => {
    const { itemStack, source, block, blockFace } = event;
    if (!itemStack || !itemStack.typeId.includes("spawn_egg")) return;

    // We only process if it's a player holding it
    if (!source || source.typeId !== "minecraft:player") return;

    // Determine spawn location based on clicked face
    let spawnX = block.x;
    let spawnY = block.y;
    let spawnZ = block.z;

    if (blockFace === "Up") spawnY++;
    else if (blockFace === "Down") spawnY--;
    else if (blockFace === "North") spawnZ--;
    else if (blockFace === "South") spawnZ++;
    else if (blockFace === "West") spawnX--;
    else if (blockFace === "East") spawnX++;

    // Center the spawn coordinates
    const location = { x: spawnX + 0.5, y: spawnY, z: spawnZ + 0.5 };
    const entityId = itemStack.typeId.replace("_spawn_egg", "");

    event.cancel = true; // Prevent vanilla breeding/spawning mechanics

    system.run(() => {
        // Safely decrement item from hand
        const eq = source.getComponent("equippable");
        if (eq) {
            const mainhand = eq.getEquipment("Mainhand");
            if (mainhand && mainhand.typeId === itemStack.typeId) {
                if (mainhand.amount > 1) {
                    mainhand.amount--;
                    eq.setEquipment("Mainhand", mainhand);
                } else {
                    eq.setEquipment("Mainhand", undefined);
                }
            }
        }

        try {
            // Spawn the entity manually and tag it as sterile
            const spawnedEntity = source.dimension.spawnEntity(entityId, location);
            if (spawnedEntity) {
                spawnedEntity.addTag("steril");
                source.sendMessage(`§a[System] Men-spawn ${formatItemName(entityId)}. §c(Makhluk ini bersifat steril/mandul)`);
            }
        } catch (e) {
            source.sendMessage("§c[System] Gagal men-spawn makhluk tersebut di lokasi ini.");
        }
    });
});

// Block interaction (breeding/feeding) for sterile animals
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const { target, player } = event;
    if (target && target.hasTag("steril")) {
        event.cancel = true;
        system.run(() => {
            player.sendMessage("§c[Sistem] Makhluk ini didapatkan dari Shop dan bersifat steril. Anda tidak bisa memberinya makan atau mengembangkannya.");
            player.dimension.runCommandAsync(`playsound note.bass @a[x=${player.location.x},y=${player.location.y},z=${player.location.z},r=5]`);
        });
    }
});

// ============================================================
// ITEM USE -- CLOCK & GUIDEBOOK TRIGGERS
// ============================================================

world.beforeEvents.itemUse.subscribe((event) => {
    const { itemStack, source } = event;
    if (itemStack.typeId === "minecraft:clock" && itemStack.nameTag === "§e§lMenu Utama") {
        event.cancel = true;
        system.run(() => {
            openMainMenu(source);
        });
    } else if (itemStack.typeId === "minecraft:book" && itemStack.nameTag === "§a§lBuku Panduan") {
        event.cancel = true;
        system.run(() => {
            openGuideBook(source);
        });
    }
});

// ============================================================
// RPG TRIGGERS -- FISHING XP & TIDAL SURGE SKILL & MASTER FISHER
// ============================================================

// Fishing Loot Table for Master Fisher skill
const FISHING_LOOT_TABLE = [
    // Common fish (60% combined weight)
    { item: "minecraft:cod",               minAmount: 1, maxAmount: 3, weight: 20 },
    { item: "minecraft:salmon",            minAmount: 1, maxAmount: 2, weight: 15 },
    { item: "minecraft:tropical_fish",     minAmount: 1, maxAmount: 1, weight: 10 },
    { item: "minecraft:pufferfish",        minAmount: 1, maxAmount: 1, weight: 8  },
    { item: "minecraft:bone",              minAmount: 1, maxAmount: 3, weight: 7  },
    // Uncommon sea items (25% combined weight)
    { item: "minecraft:prismarine_shard",  minAmount: 1, maxAmount: 2, weight: 8  },
    { item: "minecraft:prismarine_crystals",minAmount: 1, maxAmount: 1, weight: 5  },
    { item: "minecraft:kelp",              minAmount: 2, maxAmount: 5, weight: 5  },
    { item: "minecraft:seagrass",          minAmount: 2, maxAmount: 4, weight: 4  },
    { item: "minecraft:lily_pad",          minAmount: 1, maxAmount: 2, weight: 3  },
    // Rare treasures (12% combined weight)
    { item: "minecraft:nautilus_shell",    minAmount: 1, maxAmount: 1, weight: 5  },
    { item: "minecraft:saddle",            minAmount: 1, maxAmount: 1, weight: 3  },
    { item: "minecraft:name_tag",          minAmount: 1, maxAmount: 1, weight: 2  },
    { item: "minecraft:enchanted_book",    minAmount: 1, maxAmount: 1, weight: 2  },
    // Very Rare (3% combined weight)
    { item: "minecraft:heart_of_the_sea",  minAmount: 1, maxAmount: 1, weight: 1.5 },
    { item: "minecraft:diamond",           minAmount: 1, maxAmount: 1, weight: 1  },
    { item: "minecraft:golden_apple",      minAmount: 1, maxAmount: 1, weight: 0.5 },
];

const totalLootWeight = FISHING_LOOT_TABLE.reduce((sum, e) => sum + e.weight, 0);

function rollFishingLoot() {
    let roll = Math.random() * totalLootWeight;
    for (const entry of FISHING_LOOT_TABLE) {
        roll -= entry.weight;
        if (roll <= 0) {
            const amount = Math.floor(Math.random() * (entry.maxAmount - entry.minAmount + 1)) + entry.minAmount;
            return { item: entry.item, amount };
        }
    }
    return { item: "minecraft:cod", amount: 1 };
}

// Master Fisher cooldown tracker
const masterFisherCooldowns = new Map();

world.beforeEvents.itemUse.subscribe((event) => {
    const { itemStack, source } = event;
    if (itemStack.typeId !== "minecraft:fishing_rod") return;
    if (!source || source.typeId !== "minecraft:player") return;

    // Check for Tidal Surge skill activation (Sneak + Fishing Rod)
    let isSneaking = false;
    try { isSneaking = source.isSneaking; } catch(e) {}

    if (isSneaking) {
        try {
            const rpgData = getPlayerRpgData(source);
            if (rpgData.equippedSkills.includes("tidal_surge")) {
                if (canUseActiveSkill(source.name, "tidal_surge", 15000)) { // 15 seconds cooldown
                    event.cancel = true; // Prevent casting rod, activate skill instead
                    system.run(() => {
                        try {
                            const dimension = source.dimension;
                            const loc = source.location;

                            // Damage nearby hostile entities within 4 blocks
                            dimension.runCommandAsync(`damage @e[x=${loc.x},y=${loc.y},z=${loc.z},r=4,rm=0.1,type=!player,type=!item] 4 entity_attack entity "${source.name}"`);

                            // Knockback roar particle + water splash
                            dimension.runCommandAsync(`particle minecraft:knockback_roar_particle ${loc.x} ${loc.y + 1} ${loc.z}`);
                            dimension.spawnParticle("minecraft:water_evaporation_emitter", loc);

                            // Sound effect
                            dimension.runCommandAsync(`playsound random.splash @a[x=${loc.x},y=${loc.y},z=${loc.z},r=15] 1.0 0.8`);
                            dimension.runCommandAsync(`playsound random.orb @a[x=${loc.x},y=${loc.y},z=${loc.z},r=10] 0.5 1.5`);

                            // Self buffs: Speed 2 + Dolphin's Grace for 5 seconds
                            source.addEffect("speed", 100, { amplifier: 1, showParticles: true }); // Speed 2
                            source.addEffect("conduit_power", 100, { amplifier: 0, showParticles: true }); // Conduit Power (underwater haste + vision)

                            source.sendMessage("§b[Fishing] §fTidal Surge aktif! Gelombang air menghantam musuh di sekitarmu!");
                        } catch(e) {}
                    });
                } else {
                    system.run(() => {
                        source.sendMessage("§c[Fishing] Tidal Surge sedang cooldown!");
                    });
                }
                return; // Don't process normal fishing XP when skill triggers
            }
        } catch(e) {}
    }

    // ============================================================
    // MASTER FISHER: Auto-catch + 3-6 multi-loot
    // ============================================================
    try {
        const rpgData = getPlayerRpgData(source);
        if (rpgData.equippedSkills.includes("master_fisher") && !isSneaking) {
            const lastMFCast = masterFisherCooldowns.get(source.name) || 0;
            if (Date.now() - lastMFCast > 8000) { // 8 seconds cooldown
                event.cancel = true; // Prevent normal rod cast
                masterFisherCooldowns.set(source.name, Date.now());

                system.run(() => {
                    try {
                        const loc = source.location;
                        const dimension = source.dimension;

                        // Play cast sound
                        dimension.runCommandAsync(`playsound random.splash @a[x=${loc.x},y=${loc.y},z=${loc.z},r=15] 0.6 1.2`);

                        source.sendMessage("§3[Fishing] §fKail masuk air! Menarik ikan...");
                    } catch(e) {}
                });

                // After 1.5 seconds (simulating hook entering water), give loot
                system.runTimeout(() => {
                    try {
                        const loc = source.location;
                        const dimension = source.dimension;

                        // Determine number of items: 3-6 random
                        const numItems = Math.floor(Math.random() * 4) + 3; // 3 to 6

                        let lootList = [];
                        for (let i = 0; i < numItems; i++) {
                            const loot = rollFishingLoot();
                            try {
                                const itemStack = new ItemStack(loot.item, loot.amount);
                                dimension.spawnItem(itemStack, { x: loc.x + (Math.random() - 0.5) * 2, y: loc.y + 0.5, z: loc.z + (Math.random() - 0.5) * 2 });
                                lootList.push(`${loot.amount}x ${loot.item.replace("minecraft:", "")}`);
                            } catch(e) {}
                        }

                        // Play catch sounds
                        dimension.runCommandAsync(`playsound random.orb @a[x=${loc.x},y=${loc.y},z=${loc.z},r=10] 0.8 1.0`);
                        dimension.runCommandAsync(`playsound random.splash @a[x=${loc.x},y=${loc.y},z=${loc.z},r=15] 1.0 0.8`);

                        // Water particles
                        try { dimension.spawnParticle("minecraft:water_evaporation_emitter", loc); } catch(e) {}

                        source.sendMessage(`§3[Nelayan Ahli] §fAuto-catch! Dapat §e${numItems}§f item: §b${lootList.join("§f, §b")}`);

                        // Give fishing XP
                        addXp(source, "fishing", 8 + numItems); // Bonus XP per item
                        trackQuestProgress(source, "fish_cast", 1);
                        trackStat(source, "fishCaught", 1);

                        // Angler's Fortune also triggers on master fisher catches
                        const fisherRpgData = getPlayerRpgData(source);
                        if (fisherRpgData.equippedSkills.includes("anglers_fortune")) {
                            const roll = Math.random();
                            let bonusItem = "";
                            let bonusAmount = 1;
                            if (roll < 0.40) { bonusItem = "minecraft:cod"; bonusAmount = Math.floor(Math.random() * 3) + 1; }
                            else if (roll < 0.70) { bonusItem = "minecraft:prismarine_shard"; bonusAmount = Math.floor(Math.random() * 2) + 1; }
                            else if (roll < 0.90) { bonusItem = "minecraft:nautilus_shell"; }
                            else { bonusItem = "minecraft:heart_of_the_sea"; }

                            try {
                                const bonusStack = new ItemStack(bonusItem, bonusAmount);
                                dimension.spawnItem(bonusStack, loc);
                                source.sendMessage(`§b[Fishing] §fAngler's Fortune! Bonus: ${bonusAmount}x ${bonusItem.replace("minecraft:", "")}!`);
                            } catch(e) {}
                        }
                    } catch(e) {}
                }, 30); // 1.5 seconds delay (30 ticks)

                return; // Don't process normal fishing logic
            } else {
                system.run(() => {
                    source.sendMessage("§c[Fishing] Nelayan Ahli sedang cooldown!");
                });
                event.cancel = true;
                return;
            }
        }
    } catch(e) {}

    // Normal fishing -- give XP with 5-second cooldown per use
    system.run(() => {
        const lastTime = fishingXpCooldowns.get(source.name) || 0;
        if (Date.now() - lastTime > 5000) { // 5 seconds cooldown
            addXp(source, "fishing", 8);
            fishingXpCooldowns.set(source.name, Date.now());
            // v2.1: Quest & Stats tracking
            trackQuestProgress(source, "fish_cast", 1);
            trackStat(source, "fishCaught", 1);

            // Passive Skill: Angler's Fortune (bonus rare loot on fishing)
            const fisherRpgData = getPlayerRpgData(source);
            if (fisherRpgData.equippedSkills.includes("anglers_fortune")) {
                const roll = Math.random();
                let bonusItem = "";
                let bonusAmount = 1;
                if (roll < 0.40) { bonusItem = "minecraft:cod"; bonusAmount = Math.floor(Math.random() * 3) + 1; }
                else if (roll < 0.70) { bonusItem = "minecraft:prismarine_shard"; bonusAmount = Math.floor(Math.random() * 2) + 1; }
                else if (roll < 0.90) { bonusItem = "minecraft:nautilus_shell"; }
                else { bonusItem = "minecraft:heart_of_the_sea"; }

                try {
                    const bonusStack = new ItemStack(bonusItem, bonusAmount);
                    source.dimension.spawnItem(bonusStack, source.location);
                    source.sendMessage(`§b[Fishing] §fAngler's Fortune! Bonus: ${bonusAmount}x ${bonusItem.replace("minecraft:", "")}!`);
                } catch(e) {}
            }
        }
    });
});

// ============================================================
// RPG TRIGGERS -- TOOL SKILLS (Seismic Slam, Leaf Storm, Green Thumb)
// ============================================================

world.beforeEvents.itemUse.subscribe((event) => {
    const { itemStack, source } = event;
    if (!source || source.typeId !== "minecraft:player") return;

    let isSneaking = false;
    try { isSneaking = source.isSneaking; } catch(e) {}
    if (!isSneaking) return; // All tool skills require sneaking

    const rpgData = getPlayerRpgData(source);
    const heldItem = itemStack.typeId;

    // Seismic Slam: Sneak + Pickaxe
    if (heldItem.includes("pickaxe") && rpgData.equippedSkills.includes("seismic_slam")) {
        if (canUseActiveSkill(source.name, "seismic_slam", 10000)) { // 10s CD
            event.cancel = true;
            system.run(() => {
                const broken = breakColumnArea(source);
                if (broken > 0) {
                    addXp(source, "mining", broken * 3);
                    source.sendMessage(`§b[Mining] §fSeismic Slam! Menghancurkan ${broken} blok di bawah!`);
                }
                try {
                    const loc = source.location;
                    source.dimension.runCommandAsync(`particle minecraft:knockback_roar_particle ${loc.x} ${loc.y - 1} ${loc.z}`);
                    source.dimension.runCommandAsync(`playsound random.explode @a[x=${loc.x},y=${loc.y},z=${loc.z},r=10] 0.5 1.5`);
                } catch(e) {}
            });
        } else {
            system.run(() => { source.sendMessage("§c[Mining] Seismic Slam sedang cooldown!"); });
        }
        return;
    }

    // Leaf Storm: Sneak + Axe
    if (heldItem.includes("axe") && !heldItem.includes("pickaxe") && rpgData.equippedSkills.includes("leaf_storm")) {
        if (canUseActiveSkill(source.name, "leaf_storm", 8000)) { // 8s CD
            event.cancel = true;
            system.run(() => {
                const broken = breakLeafArea(source);
                if (broken > 0) {
                    source.sendMessage(`§a[Woodcutting] §fLeaf Storm! ${broken} daun berjatuhan!`);
                }
                try {
                    const loc = source.location;
                    source.dimension.spawnParticle("minecraft:crop_growth_area_emitter", loc);
                    source.dimension.runCommandAsync(`playsound step.grass @a[x=${loc.x},y=${loc.y},z=${loc.z},r=10] 1.0 2.0`);
                } catch(e) {}
            });
        } else {
            system.run(() => { source.sendMessage("§c[Woodcutting] Leaf Storm sedang cooldown!"); });
        }
        return;
    }

    // Green Thumb: Sneak + Hoe
    if (heldItem.includes("hoe") && rpgData.equippedSkills.includes("green_thumb")) {
        if (canUseActiveSkill(source.name, "green_thumb", 10000)) { // 10s CD
            event.cancel = true;
            system.run(() => {
                const harvested = harvestAndReplantArea(source);
                if (harvested > 0) {
                    addXp(source, "farming", harvested * 8);
                    source.sendMessage(`§2[Farming] §fGreen Thumb! ${harvested} tanaman dipanen & ditanam ulang!`);
                } else {
                    source.sendMessage("§7[Farming] Tidak ada tanaman masak di sekitar.");
                }
                try {
                    const loc = source.location;
                    source.dimension.spawnParticle("minecraft:crop_growth_area_emitter", loc);
                    source.dimension.runCommandAsync(`playsound random.levelup @a[x=${loc.x},y=${loc.y},z=${loc.z},r=10] 0.5 2.0`);
                } catch(e) {}
            });
        } else {
            system.run(() => { source.sendMessage("§c[Farming] Green Thumb sedang cooldown!"); });
        }
        return;
    }
});

// ============================================================
// RPG TRIGGERS -- BLOCK BREAKING (MINING & WOODCUTTING)
// ============================================================

// Cooldown Tracker for Rare Ore Broadcasts to prevent spam from veins or 3x3 skill
const oreBroadcastCooldowns = new Map();

// Cooldown Tracker for Fishing XP to prevent spam casting
const fishingXpCooldowns = new Map();

world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player, brokenBlockPermutation, block } = event;
    const typeId = brokenBlockPermutation.type.id;

    // Rare Ore Broadcast Logic
    if (typeId === "minecraft:diamond_ore" || typeId === "minecraft:deepslate_diamond_ore") {
        const lastTime = oreBroadcastCooldowns.get(`${player.name}_diamond`) || 0;
        if (Date.now() - lastTime > 15000) { // 15 seconds cooldown
            world.sendMessage(`§b[INFO] §f${player.name} baru saja menemukan §bDiamond§f!`);
            oreBroadcastCooldowns.set(`${player.name}_diamond`, Date.now());
            // v2.1: Achievement
            unlockAchievement(player, "find_diamond");
        }
    } else if (typeId === "minecraft:ancient_debris") {
        const lastTime = oreBroadcastCooldowns.get(`${player.name}_debris`) || 0;
        if (Date.now() - lastTime > 15000) {
            world.sendMessage(`§5[INFO] §f${player.name} baru saja menemukan §5Ancient Debris§f!`);
            oreBroadcastCooldowns.set(`${player.name}_debris`, Date.now());
            // v2.1: Achievement
            unlockAchievement(player, "find_debris");
        }
    }

    // Categorize block types
    const isWood = typeId.includes("log") || typeId.includes("stem") || typeId.includes("wood") || typeId.includes("hyphae") || typeId.includes("cherry_leaves");
    const isOre = typeId.includes("ore") || typeId.includes("stone") || typeId.includes("basalt") || typeId.includes("granite") || typeId.includes("diorite") || typeId.includes("andesite") || typeId.includes("netherrack") || typeId.includes("deepslate") || typeId.includes("tuff") || typeId.includes("calcite") || typeId.includes("dripstone") || typeId.includes("amethyst") || typeId.includes("obsidian");
    const isCrop = isCropBlock(typeId);

    const rpgData = getPlayerRpgData(player);

    // Check main hand tool
    const invComponent = player.getComponent("inventory");
    let heldItem = "";
    let mainHandItemStack = null;
    if (invComponent && invComponent.container) {
        const item = invComponent.container.getItem(player.selectedSlotIndex);
        if (item) {
            heldItem = item.typeId;
            mainHandItemStack = item;
        }
    }

    if (isWood) {
        // Base XP: 5 per log
        addXp(player, "woodcutting", 5);
        // v2.1: Quest & Stats tracking
        trackQuestProgress(player, "break_logs", 1);
        trackStat(player, "logsBroken", 1);

        // Active Skill: Treecapitator (Tool Requirement: Axe)
        if (rpgData.equippedSkills.includes("treecapitator") && heldItem.includes("axe") && !heldItem.includes("pickaxe")) {
            const broken = breakTreecapitator(player, block);
            if (broken > 0) {
                addXp(player, "woodcutting", broken * 5);
            }
        }

        // Passive Skill: Bark Armor (Resistance 1 for 8s on log break, 30s CD)
        if (rpgData.equippedSkills.includes("bark_armor")) {
            if (canUseActiveSkill(player.name, "bark_armor", 30000)) {
                player.addEffect("resistance", 160, { amplifier: 0, showParticles: true }); // Resistance 1 for 8s
            }
        }
    } else if (isOre) {
        // Base XP: 3 per stone/ore
        addXp(player, "mining", 3);
        // v2.1: Quest & Stats tracking
        trackQuestProgress(player, "break_blocks", 1);
        trackStat(player, "blocksBroken", 1);

        // Event: Jam Emas (Golden Hour) -- Bonus gold nugget drops when mining
        if (isEventActive("golden_hour") && isOre) {
            try {
                const goldNugget = new ItemStack("minecraft:gold_nugget", Math.floor(Math.random() * 3) + 1);
                player.dimension.spawnItem(goldNugget, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
                player.sendMessage("§6[Event] Jam Emas! Bonus Gold Nugget dari mining!");
            } catch(e) {}
        }

        // Active Skill: Ore Excavation (Tool Requirement: Pickaxe)
        if (rpgData.equippedSkills.includes("ore_excavation") && heldItem.includes("pickaxe")) {
            const broken = breakBlockArea(player, block, 1, mainHandItemStack);
            if (broken > 0) {
                addXp(player, "mining", broken * 3);
            }
        }

        // Passive Skill: Deep Core Mining (20% chance double ore drops)
        if (rpgData.equippedSkills.includes("deep_core_mining") && heldItem.includes("pickaxe")) {
            if (typeId.includes("ore") && Math.random() < 0.20) {
                // Map ore to its raw drop
                let dropItem = "";
                if (typeId.includes("diamond")) dropItem = "minecraft:diamond";
                else if (typeId.includes("emerald")) dropItem = "minecraft:emerald";
                else if (typeId.includes("coal")) dropItem = "minecraft:coal";
                else if (typeId.includes("iron")) dropItem = "minecraft:raw_iron";
                else if (typeId.includes("gold")) dropItem = "minecraft:raw_gold";
                else if (typeId.includes("copper")) dropItem = "minecraft:raw_copper";
                else if (typeId.includes("lapis")) dropItem = "minecraft:lapis_lazuli";
                else if (typeId.includes("redstone")) dropItem = "minecraft:redstone";
                else if (typeId.includes("quartz")) dropItem = "minecraft:quartz";
                else if (typeId.includes("amethyst")) dropItem = "minecraft:amethyst_shard";

                if (dropItem !== "") {
                    try {
                        const extraDrop = new ItemStack(dropItem, 1);
                        player.dimension.spawnItem(extraDrop, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
                        player.sendMessage("§b[Mining] §fDeep Core Mining! Double drop!");
                    } catch(e) {}
                }
            }
        }
    } else if (isCrop) {
        // Base XP: 8 per crop harvested
        addXp(player, "farming", 8);
        // v2.1: Quest & Stats tracking
        trackQuestProgress(player, "harvest_crops", 1);
        trackStat(player, "cropsHarvested", 1);

        // Active Skill: Bountiful Harvest (Tool Requirement: Hoe)
        if (rpgData.equippedSkills.includes("bountiful_harvest") && heldItem.includes("hoe")) {
            const broken = breakCropArea(player, block);
            if (broken > 0) {
                addXp(player, "farming", broken * 8);
            }
        }

        // Passive Skill: Nature's Gift (25% chance double crop drops)
        if (rpgData.equippedSkills.includes("natures_gift")) {
            if (Math.random() < 0.25) {
                // Spawn a bonus crop item
                let cropDrop = "";
                if (typeId.includes("wheat")) cropDrop = "minecraft:wheat";
                else if (typeId.includes("carrot")) cropDrop = "minecraft:carrot";
                else if (typeId.includes("potato")) cropDrop = "minecraft:potato";
                else if (typeId.includes("beetroot")) cropDrop = "minecraft:beetroot";
                else if (typeId.includes("melon")) cropDrop = "minecraft:melon_slice";
                else if (typeId.includes("pumpkin")) cropDrop = "minecraft:pumpkin_pie";

                if (cropDrop !== "") {
                    try {
                        const bonusCrop = new ItemStack(cropDrop, 1);
                        player.dimension.spawnItem(bonusCrop, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
                    } catch(e) {}
                }
            }
        }
    }
});

// ============================================================
// RPG TRIGGERS -- SLAYER XP & BOUNTY CLAIMS ON ENTITY DEATH
// ============================================================

// Cooldown Tracker for Slayer XP to prevent auto-spawner farming
const slayerXpCooldowns = new Map();

world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    const damageSource = event.damageSource;
    const killer = damageSource.damagingEntity;

    // v2.5: Arena mob kill tracking
    try {
        if (deadEntity.hasTag && deadEntity.hasTag("arena_mob")) {
            handleArenaMobKill(deadEntity, killer);
        }
    } catch(e) {}

    // v2.5: Player death during arena
    if (deadEntity.typeId === "minecraft:player") {
        try {
            handleArenaPlayerDeath(deadEntity);
        } catch(e) {}
    }

    // Check if there is a killer and the killer is a player
    if (killer && killer.typeId === "minecraft:player") {
        const killerPlayer = killer;

        // RPG Slayer XP logic (For non-player entity kills)
        const isMonster = !deadEntity.typeId.includes("player") && !deadEntity.typeId.includes("item");
        if (isMonster) {
            // Check Slayer Cooldown (max 1 kill registered for XP per 1.5 seconds)
            const lastSlayerXp = slayerXpCooldowns.get(killerPlayer.name) || 0;
            if (Date.now() - lastSlayerXp > 1500) {
                // Base XP: 10 per mob kill
                addXp(killerPlayer, "slayer", 10);
                slayerXpCooldowns.set(killerPlayer.name, Date.now());
                // v2.1: Quest & Stats tracking
                trackQuestProgress(killerPlayer, "kill_mobs", 1);
                trackStat(killerPlayer, "mobsKilled", 1);
            }

            // Passive Skill: Bloodlust (Speed 1 + Strength 1 for 6s on mob kill)
            const killerRpgData = getPlayerRpgData(killerPlayer);
            if (killerRpgData.equippedSkills.includes("bloodlust")) {
                killerPlayer.addEffect("speed", 120, { amplifier: 0, showParticles: true }); // Speed 1 for 6s
                killerPlayer.addEffect("strength", 120, { amplifier: 0, showParticles: true }); // Strength 1 for 6s
            }

            // v2.6: Blood Frenzy (Gacha Passive) -- Kill stacking
            const gachaPassives = killerRpgData.equippedGachaPassives || [];
            if (gachaPassives.includes("blood_frenzy")) {
                const constell = killerRpgData.passiveConstellation || {};
                const t = constell["blood_frenzy"] || 0;
                const maxStacks = t >= 2 ? 7 : 5;
                const duration = t >= 2 ? 12000 : t >= 1 ? 10000 : 8000;

                try {
                    let frenzyData = { stacks: 0, lastKill: 0, duration: duration };
                    const frenzyStr = killerPlayer.getDynamicProperty("blood_frenzy_stacks");
                    if (frenzyStr && typeof frenzyStr === 'string') {
                        const parsed = JSON.parse(frenzyStr);
                        // If still within duration, add stack; otherwise reset
                        if (Date.now() - parsed.lastKill < parsed.duration) {
                            frenzyData.stacks = Math.min((parsed.stacks || 0) + 1, maxStacks);
                        } else {
                            frenzyData.stacks = 1;
                        }
                    } else {
                        frenzyData.stacks = 1;
                    }
                    frenzyData.lastKill = Date.now();
                    frenzyData.duration = duration;
                    killerPlayer.setDynamicProperty("blood_frenzy_stacks", JSON.stringify(frenzyData));

                    killerPlayer.sendMessage(`§c[Blood Frenzy] §fStack: §e${frenzyData.stacks}/${maxStacks}§f! Semakin kuat!`);
                } catch(e) {}
            }

            // v2.6: Soul Harvest (C1+): Extra heal on kill
            if (gachaPassives.includes("soul_harvest")) {
                const constell = killerRpgData.passiveConstellation || {};
                const t = constell["soul_harvest"] || 0;
                if (t >= 1) {
                    // C1+: Bigger heal on kill
                    const healAmp = t >= 2 ? 2 : 1;
                    killerPlayer.addEffect("instant_health", 1, { amplifier: healAmp, showParticles: true });
                }
            }
        }

        // Check if the dead entity is a player for Bounty claims
        if (deadEntity.typeId === "minecraft:player") {
            const deadPlayerName = deadEntity.name;

            if (activeBounties[deadPlayerName] && killerPlayer.name !== deadPlayerName) {
                const bountyData = activeBounties[deadPlayerName];
                const bountyAmount = bountyData.amount;

                // Give reward to killer
                const killerCoins = getScore(killerPlayer, "dompet");
                setScore(killerPlayer, "dompet", killerCoins + bountyAmount);

                // Announce to world
                world.sendMessage(`§c§l[BOUNTY CLAIMED] §r§b${killerPlayer.name} §ftelah membunuh buronan §c${deadPlayerName} §fdan mendapatkan hadiah §e${formatRupiah(bountyAmount)}§f!`);

                // Remove bounty and save state
                delete activeBounties[deadPlayerName];
                saveBounties(activeBounties);
                // v2.1: Achievement & Stats
                unlockAchievement(killerPlayer, "first_bounty_claim");
                trackStat(killerPlayer, "bountiesClaimed", 1);
            }
        }
    }

    // v2.1: Track player death stats (regardless of killer)
    if (deadEntity.typeId === "minecraft:player") {
        try {
            trackStat(deadEntity, "deaths", 1);
        } catch(e) {}
    }
});
